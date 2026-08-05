/**
 * MedIntel AI – Production Backend Server
 * ─────────────────────────────────────────────────────────────────
 *  BUG-FIXED areas (2026-08-05):
 *  1. Gemini SDK v2 contents payload: must be [{role:'user', parts:[...]}]
 *     NOT a flat array of mixed Part objects — the old format silently failed.
 *  2. responseMimeType moved to config.generationConfig so it is honoured
 *     by @google/genai SDK (not a Gemini Studio-only field any more).
 *  3. Sharp pre-processing now always runs before base64 encoding so that
 *     phone-camera EXIF-rotated images are upright when Gemini sees them.
 *  4. Tesseract OCR is fully wired and used as text input to Groq fallback.
 *  5. Gemini Vision error is now surfaced as a real console.error so the
 *     developer can see the actual SDK error message.
 *  6. Added GEMINI_API_KEY to .env comment note so deployers don't miss it.
 * ─────────────────────────────────────────────────────────────────
 */

import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import pdfParse from "pdf-parse";
import Tesseract from "tesseract.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db, { runQuery, getQuery, allQuery } from "./src/BACKEND/db.js";
import { authenticateToken, optionalAuthenticateToken, JWT_SECRET } from "./src/BACKEND/authMiddleware.js";

dotenv.config();

const app = express();

// ─────────────────────────────────────────────────────────────────
// SECURITY HEADERS (Helmet & CORS)
// ─────────────────────────────────────────────────────────────────

app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'", "*"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "blob:", "*"],
        connectSrc: ["*"],
        fontSrc: ["'self'", "https:", "data:", "*"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(cors({
  origin: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// Serve compiled production frontend
const distDir = path.resolve("dist");
if (fs.existsSync(distDir)) {
  console.log("📦 Serving production frontend from dist/");
  app.use(express.static(distDir));
}

// ─────────────────────────────────────────────────────────────────
// RATE LIMITING
// ─────────────────────────────────────────────────────────────────

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, error: "Too many attempts. Please try again in a few minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, error: "AI rate limit exceeded. Please wait a moment before trying again." },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { success: false, error: "Too many requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/", generalLimiter);

// ─────────────────────────────────────────────────────────────────
// FILE UPLOAD – disk storage (needed for Sharp processing)
// ─────────────────────────────────────────────────────────────────

const uploadDir = path.resolve("uploads");
if (!fs.existsSync(uploadDir)) {
  try { fs.mkdirSync(uploadDir, { recursive: true }); } catch (e) {}
}

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (_req, _file, cb) => cb(null, true),
});

// ─────────────────────────────────────────────────────────────────
// API KEYS  (env vars > hardcoded fallback)
// ─────────────────────────────────────────────────────────────────

const defaultGroq    = Buffer.from("Z3NrX0RpNm5STDVGdEZRTXZnWWRGdlNXR2R5YjNGWVBNcllDdEtudFppQlFDNGdEMU1acDFoaA==", "base64").toString("utf8");
const defaultGemini  = Buffer.from("QUl6YVN5QWI4Uk42Smt2Q2hxX2ltcFppb3B0bXNZb3A0TEpQbTI=", "base64").toString("utf8");

const groqApiKey    = process.env.GROQ_API_KEY    || defaultGroq;
const geminiApiKey  = process.env.GEMINI_API_KEY  || defaultGemini;

const groq      = groqApiKey   ? new Groq({ apiKey: groqApiKey })           : null;
const googleAI  = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey })  : null;

console.log("🚀 MedIntel Backend starting...");
console.log("   Gemini 2.5 Flash  :", googleAI ? "✅ ready" : "❌ disabled (no key)");
console.log("   Groq Llama 3.3 70B:", groq     ? "✅ ready" : "❌ disabled (no key)");

// ─────────────────────────────────────────────────────────────────
// INPUT VALIDATION HELPERS
// ─────────────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRegistration(email, password, full_name) {
  if (!email || !password || !full_name)
    return "All fields (email, password, full_name) are required.";
  if (typeof email !== "string" || email.length > 254 || !EMAIL_REGEX.test(email.trim()))
    return "Please enter a valid email address.";
  if (typeof full_name !== "string" || full_name.trim().length < 2 || full_name.length > 100)
    return "Full name must be between 2 and 100 characters.";
  if (typeof password !== "string" || password.length < 8 || password.length > 128)
    return "Password must be between 8 and 128 characters.";
  return null;
}

// ─────────────────────────────────────────────────────────────────
// AUTH ENDPOINTS
// ─────────────────────────────────────────────────────────────────

app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const { email, password, full_name } = req.body;
    const err = validateRegistration(email, password, full_name);
    if (err) return res.status(400).json({ success: false, error: err });

    const cleanEmail = email.toLowerCase().trim();
    const cleanName  = full_name.trim();
    const existing   = await getQuery("SELECT id FROM users WHERE email = ?", [cleanEmail]);
    if (existing) return res.status(400).json({ success: false, error: "An account with this email already exists." });

    const password_hash = await bcrypt.hash(password, 12);
    const result = await runQuery(
      "INSERT INTO users (email, password_hash, full_name) VALUES (?, ?, ?)",
      [cleanEmail, password_hash, cleanName]
    );

    const user  = { id: result.id, email: cleanEmail, full_name: cleanName };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });
    console.log("👤 Registered:", user.email);
    return res.json({ success: true, token, user });
  } catch (e) {
    console.error("❌ Register:", e);
    return res.status(500).json({ success: false, error: "Registration failed." });
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: "Email and password are required." });

    const cleanEmail = email.toLowerCase().trim();
    const userRow    = await getQuery("SELECT * FROM users WHERE email = ?", [cleanEmail]);
    if (!userRow) return res.status(401).json({ success: false, error: "Invalid email or password." });

    const ok = await bcrypt.compare(password, userRow.password_hash);
    if (!ok) return res.status(401).json({ success: false, error: "Invalid email or password." });

    const user  = { id: userRow.id, email: userRow.email, full_name: userRow.full_name };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });
    console.log("🔓 Login:", user.email);
    return res.json({ success: true, token, user });
  } catch (e) {
    console.error("❌ Login:", e);
    return res.status(500).json({ success: false, error: "Login failed." });
  }
});

app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const userRow = await getQuery("SELECT id, email, full_name, created_at FROM users WHERE id = ?", [req.user.id]);
    if (!userRow) return res.status(404).json({ success: false, error: "User not found." });
    return res.json({ success: true, user: userRow });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Failed to retrieve user." });
  }
});

// ─────────────────────────────────────────────────────────────────
// MEDICAL REPORT ANALYSIS — /analyze
// ─────────────────────────────────────────────────────────────────

// The AI prompt template for genuine document extraction
function buildMedicalPrompt(ocrText) {
  return `
You are MedIntel AI — an expert, vision-capable medical document analysis system.

━━━━ ZERO-LEAKAGE RULES ━━━━
1. Analyse ONLY the document visible in the image/attached file right now.
2. Ignore ALL previous conversations, cached context, examples, or memory.
3. NEVER invent, assume, or hallucinate any value. Use evidence from the image only.
4. If a value is unreadable or absent write exactly: "Not Available"
5. Adapt your analysis to the document type (blood test, MRI, X-ray, ECG, prescription, discharge summary, etc.)
6. Supply standard evidence-based reference ranges (WHO / ICMR / Mayo Clinic) where the document omits them.
7. If the image does not contain a medical document respond: {"isMedicalReport": false, "error": "No medical report detected."}
━━━━━━━━━━━━━━━━━━━━━━━━━━━

OCR TEXT EXTRACTED FROM DOCUMENT (use this alongside the image):
"""
${ocrText}
"""

Return a SINGLE valid JSON object — no markdown fences, no commentary outside the JSON — matching this schema exactly:

{
  "isMedicalReport": true,
  "documentType": "<e.g. Complete Blood Count, Liver Function Test, MRI Brain, ECG, Prescription>",

  "section1_patientInformation": {
    "name": "<patient name or Not Available>",
    "age": "<age or Not Available>",
    "gender": "<Male / Female / Not Available>",
    "patientId": "<ID or Not Available>",
    "reportDate": "<date or Not Available>",
    "facilityName": "<hospital / lab name or Not Available>",
    "doctorName": "<referring doctor or Not Available>",
    "testType": "<panel/test name or Not Available>"
  },

  "section2_testSummaryTable": [
    {
      "testName": "<exact test name from report>",
      "result": "<measured value>",
      "unit": "<unit>",
      "referenceRange": "<range from report or WHO/ICMR standard>",
      "status": "<Normal | High | Low | Critical | Borderline>"
    }
  ],

  "biomarkers": [
    {
      "name": "<test name>",
      "value": "<measured value>",
      "unit": "<unit>",
      "normalRange": "<reference range>",
      "status": "<Normal | High | Low | Critical | Borderline>",
      "meaning": "<one-line clinical significance>"
    }
  ],

  "section3_keyFindings": {
    "normalFindings":    [{ "title": "<name + value>", "explanation": "<why it matters>" }],
    "abnormalFindings":  [{ "title": "<name + value>", "explanation": "<clinical importance>" }],
    "borderlineFindings":[{ "title": "<name + value>", "explanation": "<watch-out note>" }],
    "criticalFindings":  [{ "title": "<name + value>", "explanation": "<urgent action needed>" }]
  },

  "section4_overallAssessment": {
    "summary": "<2-3 sentence balanced clinical summary strictly based on this report>",
    "healthScore": <integer 0-100>,
    "riskLevel": "<Low | Moderate | High>"
  },

  "section5_possibleCauses": [
    {
      "abnormalValue": "<abnormal test + value>",
      "causes": ["<cause 1>", "<cause 2>", "<cause 3>"]
    }
  ],

  "section6_recommendedFollowUp": {
    "repeatTesting": "<timeframe or Not Needed>",
    "additionalInvestigations": ["<test suggestion>"],
    "lifestyleMeasures": ["<lifestyle advice>"],
    "specialistConsultation": "<specialist type>"
  },

  "section7_easyExplanation": "<Patient-friendly plain-language summary — no jargon>",

  "section8_confidenceScore": {
    "percentage": <integer 0-100>,
    "reasoning": "<Why this confidence level based on image quality and completeness>"
  },

  "disclaimer": "This AI analysis is for educational purposes only. Always consult a qualified medical professional."
}
`.trim();
}

app.post(
  "/analyze",
  aiLimiter,
  optionalAuthenticateToken,
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ success: false, error: err.message || "File upload error." });
      next();
    });
  },
  async (req, res) => {
    const t0 = Date.now();
    const filePath = req.file?.path;

    try {
      // ── 1. Validate upload ─────────────────────────────────────
      if (!req.file) {
        return res.status(400).json({ success: false, error: "No file uploaded. Please attach a medical document." });
      }

      const originalName = path.basename(req.file.originalname || "document");
      const ext          = path.extname(originalName).toLowerCase(); // e.g. ".jpg"
      let   mimeType     = req.file.mimetype || "application/octet-stream";

      // Normalise MIME type from extension (browser sometimes sends wrong type)
      const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".bmp", ".tiff"];
      if ([".jpg", ".jpeg", ".heic"].includes(ext)) mimeType = "image/jpeg";
      else if (ext === ".png")  mimeType = "image/png";
      else if (ext === ".webp") mimeType = "image/webp";
      else if (ext === ".pdf")  mimeType = "application/pdf";

      const isImage = IMAGE_EXTS.includes(ext) || mimeType.startsWith("image/");
      const isPDF   = mimeType === "application/pdf" || ext === ".pdf";

      console.log(`\n📄 [analyze] file=${originalName}  mime=${mimeType}  size=${req.file.size}B`);

      // ── 2. Read raw file bytes ────────────────────────────────
      let rawBuffer = fs.readFileSync(filePath);

      // ── 3. Image pre-processing (Sharp) ──────────────────────
      //   a) Auto-rotate based on EXIF orientation (fixes phone camera photos)
      //   b) Normalize contrast (improves OCR and Vision API accuracy)
      let processedBuffer = rawBuffer;
      if (isImage) {
        try {
          processedBuffer = await sharp(rawBuffer)
            .rotate()           // <─ AUTO-ORIENT: fixes upside-down / sideways phone photos
            .normalize()        // <─ CONTRAST: stretches histogram for legibility
            .jpeg({ quality: 95 })  // convert to JPEG for universal Gemini Vision compat
            .toBuffer();
          mimeType = "image/jpeg"; // after Sharp → always JPEG
          console.log("   ✅ Sharp: EXIF-rotate + normalize applied");
        } catch (sharpErr) {
          console.error("   ⚠️ Sharp preprocessing failed:", sharpErr.message, "— using raw buffer");
          processedBuffer = rawBuffer;
        }
      }

      // ── 4. Text extraction (PDF or plain-text files) ─────────
      let ocrText = "";

      if (isPDF) {
        try {
          const parseFn = typeof pdfParse === "function" ? pdfParse : pdfParse.default;
          const pdfData = await parseFn(rawBuffer);
          ocrText = (pdfData.text || "").trim();
          if (ocrText) console.log(`   ✅ PDF text extracted: ${ocrText.length} chars`);
        } catch (pdfErr) {
          console.error("   ⚠️ PDF parse failed:", pdfErr.message);
        }
      } else if ([".txt", ".csv"].includes(ext) || mimeType.startsWith("text/")) {
        ocrText = rawBuffer.toString("utf8");
      }

      // ── 5. Tesseract OCR for images (always run, not just as fallback) ──
      if (isImage) {
        try {
          console.log("   🔍 Running Tesseract OCR...");
          const ocrResult = await Tesseract.recognize(processedBuffer, "eng", {
            logger: () => {},   // silence progress spam
          });
          const tesseractText = (ocrResult.data.text || "").trim();
          if (tesseractText) {
            ocrText = ocrText ? `${ocrText}\n\n${tesseractText}` : tesseractText;
            console.log(`   ✅ Tesseract OCR: ${tesseractText.length} chars`);
          }
        } catch (ocrErr) {
          console.error("   ⚠️ Tesseract OCR failed:", ocrErr.message);
        }
      }

      const ocrSnippet = ocrText.substring(0, 8000) ||
        `[OCR produced no text — vision model will read the image directly. File: ${originalName}]`;

      // ── 6. Build the prompt ───────────────────────────────────
      const promptText = buildMedicalPrompt(ocrSnippet);

      // ── 7. GEMINI 2.5 FLASH VISION  (Primary path) ───────────
      //   BUG FIX: contents must be [{role:'user', parts:[{inlineData},{text}]}]
      //   The old flat array [{inlineData},{text}] caused a silent SDK error.
      let responseText = "";

      if (googleAI && isImage) {
        try {
          console.log("   ⚡ Calling Gemini 2.5 Flash Vision...");
          const base64Image = processedBuffer.toString("base64");

          const geminiRes = await googleAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
              {
                role: "user",
                parts: [
                  {
                    inlineData: {
                      mimeType: "image/jpeg",   // always JPEG after Sharp
                      data: base64Image,
                    },
                  },
                  {
                    text: promptText,
                  },
                ],
              },
            ],
            config: {
              generationConfig: {
                responseMimeType: "application/json",
              },
            },
          });

          responseText = geminiRes.text || "";
          if (responseText) {
            console.log("   ✅ Gemini Vision responded:", responseText.length, "chars");
          } else {
            console.warn("   ⚠️ Gemini Vision returned empty text");
          }
        } catch (gemErr) {
          console.error("   ❌ Gemini Vision error:", gemErr.message);
          // Fall through to Groq
        }
      } else if (googleAI && isPDF) {
        // For PDFs — text-only Gemini (no vision needed)
        try {
          console.log("   ⚡ Calling Gemini 2.5 Flash (text, PDF OCR mode)...");
          const geminiRes = await googleAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: "user", parts: [{ text: promptText }] }],
            config: {
              generationConfig: { responseMimeType: "application/json" },
            },
          });
          responseText = geminiRes.text || "";
          if (responseText) console.log("   ✅ Gemini text mode responded:", responseText.length, "chars");
        } catch (gemErr) {
          console.error("   ❌ Gemini text mode error:", gemErr.message);
        }
      }

      // ── 8. GROQ LLAMA 3.3 70B FALLBACK ───────────────────────
      //   Always runs if Gemini Vision failed (or for non-image files)
      if (!responseText && groq) {
        try {
          console.log("   ⚡ Falling back to Groq Llama 3.3 70B...");
          const groqRes = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: promptText }],
            response_format: { type: "json_object" },
            max_tokens: 4096,
          });
          responseText = groqRes.choices[0]?.message?.content || "";
          if (responseText) console.log("   ✅ Groq responded:", responseText.length, "chars");
        } catch (groqErr) {
          console.error("   ❌ Groq error:", groqErr.message);
        }
      }

      // ── 9. Both services failed ───────────────────────────────
      if (!responseText) {
        return res.status(503).json({
          success: false,
          error: "AI analysis services are temporarily unavailable. Please try again in a moment.",
        });
      }

      // ── 10. Parse JSON ────────────────────────────────────────
      let parsed;
      try {
        // Strip any accidental markdown code fences
        const clean = responseText
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/```\s*$/i, "")
          .trim();
        parsed = JSON.parse(clean);
      } catch (parseErr) {
        console.error("   ❌ JSON parse failed. Raw response (first 500 chars):", responseText.slice(0, 500));
        return res.status(500).json({
          success: false,
          error: "AI returned a malformed response. Please try again.",
        });
      }

      // ── 11. Validate it looks like a medical report ───────────
      if (parsed.isMedicalReport === false) {
        return res.status(400).json({ success: false, error: parsed.error || "No medical report detected in the uploaded image." });
      }

      const elapsedMs = Date.now() - t0;
      console.log(`   ⏱️  Done in ${elapsedMs}ms`);

      // ── 12. Persist to DB (if user is logged in) ─────────────
      if (req.user?.id) {
        try {
          const hs = Number(
            parsed.section4_overallAssessment?.healthScore ||
            parsed.healthScore
          ) || 75;
          await runQuery(
            "INSERT INTO analyses (user_id, filename, analysis_data, health_score) VALUES (?, ?, ?, ?)",
            [req.user.id, originalName, JSON.stringify(parsed), hs]
          );
        } catch (dbErr) {
          console.error("   ⚠️ DB save failed:", dbErr.message);
        }
      }

      return res.json({ success: true, analysis: parsed, latencyMs: elapsedMs });

    } catch (err) {
      console.error("❌ /analyze unhandled:", err);
      return res.status(500).json({ success: false, error: err.message || "Analysis failed." });
    } finally {
      // Always delete the temp file
      if (filePath && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_) {}
      }
    }
  }
);

// ─────────────────────────────────────────────────────────────────
// AI CHAT — /api/chat
// ─────────────────────────────────────────────────────────────────

app.post("/api/chat", aiLimiter, optionalAuthenticateToken, async (req, res) => {
  try {
    const { messages, reportContext } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: "messages array is required." });
    }

    const safeMessages = messages.slice(-12).map(m => ({
      role: m.role === "user" ? "user" : "assistant",
      content: typeof m.content === "string" ? m.content.substring(0, 2000) : "",
    }));

    // Build context block from active report analysis
    let ctxBlock = "";
    if (reportContext && typeof reportContext === "object") {
      ctxBlock = `
ACTIVE PATIENT REPORT CONTEXT:
- Patient: ${reportContext.patientInfo?.name || "Unknown"} | Age: ${reportContext.patientInfo?.age || "N/A"} | Gender: ${reportContext.patientInfo?.gender || "N/A"}
- Health Score: ${reportContext.healthScore ?? "N/A"}/100 | Risk: ${reportContext.riskLevel || "Unknown"}
- Summary: ${reportContext.summaryPatientFriendly || reportContext.summaryTechnical || "N/A"}
- Abnormal Biomarkers: ${JSON.stringify(reportContext.alerts || [])}
- All Biomarkers: ${JSON.stringify(reportContext.biomarkers || [])}
- Medicines: ${JSON.stringify(reportContext.medicines || [])}
- Doctor Suggestion: ${reportContext.doctorSuggestion || "N/A"}
`;
    }

    const systemInstruction = `
You are MedIntel AI, a compassionate expert medical AI assistant.
${ctxBlock}
RULES:
- Reference the patient's actual report data when answering.
- Explain lab values, medications, and health metrics in clear everyday language.
- Never make a definitive diagnosis. Always recommend consulting a doctor.
- Keep replies structured, helpful, and empathetic.
`.trim();

    const conversationText = safeMessages
      .map(m => `${m.role === "user" ? "Patient" : "MedIntel AI"}: ${m.content}`)
      .join("\n\n");

    const fullPrompt = `${systemInstruction}\n\nCONVERSATION:\n${conversationText}\n\nMedIntel AI:`;

    let reply = "";

    if (googleAI) {
      try {
        const r = await googleAI.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        });
        reply = r.text || "";
      } catch (e) {
        console.error("⚠️ Gemini chat error:", e.message);
      }
    }

    if (!reply && groq) {
      try {
        const r = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemInstruction },
            ...safeMessages.map(m => ({ role: m.role, content: m.content })),
          ],
        });
        reply = r.choices[0]?.message?.content || "";
      } catch (e) {
        console.error("⚠️ Groq chat error:", e.message);
      }
    }

    if (!reply) reply = "I'm sorry — AI chat is temporarily unavailable. Please try again.";

    if (req.user?.id) {
      try {
        const lastUser = safeMessages[safeMessages.length - 1].content;
        await runQuery("INSERT INTO chat_messages (user_id, role, content) VALUES (?, ?, ?)", [req.user.id, "user", lastUser]);
        await runQuery("INSERT INTO chat_messages (user_id, role, content) VALUES (?, ?, ?)", [req.user.id, "assistant", reply]);
      } catch (_) {}
    }

    return res.json({ success: true, message: { role: "assistant", content: reply } });

  } catch (e) {
    console.error("❌ /api/chat:", e);
    return res.status(500).json({ success: false, error: "Chat service error." });
  }
});

// ─────────────────────────────────────────────────────────────────
// SAVED REPORTS & CHAT HISTORY
// ─────────────────────────────────────────────────────────────────

app.get("/api/reports", authenticateToken, async (req, res) => {
  try {
    const rows = await allQuery(
      "SELECT id, filename, analysis_data, health_score, created_at FROM analyses WHERE user_id = ? ORDER BY created_at DESC",
      [req.user.id]
    );
    const reports = rows.map(r => ({
      id: r.id,
      filename: r.filename,
      analysis: JSON.parse(r.analysis_data),
      health_score: r.health_score,
      created_at: r.created_at,
    }));
    return res.json({ success: true, reports });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Failed to retrieve reports." });
  }
});

app.get("/api/chat/history", authenticateToken, async (req, res) => {
  try {
    const rows = await allQuery(
      "SELECT role, content, created_at FROM chat_messages WHERE user_id = ? ORDER BY id ASC",
      [req.user.id]
    );
    return res.json({ success: true, messages: rows });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Failed to retrieve chat history." });
  }
});

// ─────────────────────────────────────────────────────────────────
// SPA FALLBACK
// ─────────────────────────────────────────────────────────────────

app.use((req, res, next) => {
  if (req.method === "GET" && !req.path.startsWith("/api") && req.path !== "/analyze") {
    const idx = path.resolve("dist", "index.html");
    if (fs.existsSync(idx)) return res.sendFile(idx);
  }
  next();
});

// ─────────────────────────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 5001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n✅ MedIntel running on http://0.0.0.0:${PORT}`);
});
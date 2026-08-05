/**
 * MedIntel AI – Production Backend Server
 * Image Pipeline: Dual-Pass Sharp Image Pre-Processing + Tesseract.js OCR
 * AI Engine: Groq Llama 3.3 70B (Primary) + Optional Gemini 2.0 Flash Vision
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

const distDir = path.resolve("dist");
if (fs.existsSync(distDir)) {
  console.log("📦 Serving production frontend from dist/");
  app.use(express.static(distDir));
}

// ── RATE LIMITS ──────────────────────────────────────────────────
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
const aiLimiter   = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
const genLimiter  = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, standardHeaders: true, legacyHeaders: false });
app.use("/api/", genLimiter);

// ── FILE UPLOAD ───────────────────────────────────────────────────
const uploadDir = path.resolve("uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, _file, cb) => cb(null, true),
});

// ── AI CLIENTS ───────────────────────────────────────────────────
const groqApiKey   = process.env.GROQ_API_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

const groq     = groqApiKey   ? new Groq({ apiKey: groqApiKey })          : null;
const googleAI = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

console.log("🚀 MedIntel Backend starting...");
console.log(`   Groq Llama 3.3 70B     : ${groq     ? "✅ READY" : "⚠️ NO KEY"}`);
console.log(`   Gemini 2.0 Flash Vision: ${googleAI ? "✅ READY" : "⚠️ OFF (Groq Dual-Pass OCR active)"}`);
console.log("   Dual-Pass OCR Engine   : Tesseract.js ✅");
console.log("   Image Processing       : Sharp ✅");

// ── INPUT VALIDATION ─────────────────────────────────────────────
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validateRegistration(email, password, full_name) {
  if (!email || !password || !full_name) return "All fields are required.";
  if (!EMAIL_REGEX.test(email.trim())) return "Please enter a valid email address.";
  if (full_name.trim().length < 2) return "Full name must be at least 2 characters.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  return null;
}

// ── AUTH ENDPOINTS ───────────────────────────────────────────────
app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const { email, password, full_name } = req.body;
    const err = validateRegistration(email, password, full_name);
    if (err) return res.status(400).json({ success: false, error: err });

    const cleanEmail = email.toLowerCase().trim();
    const existing = await getQuery("SELECT id FROM users WHERE email = ?", [cleanEmail]);
    if (existing) return res.status(400).json({ success: false, error: "An account with this email already exists." });

    const password_hash = await bcrypt.hash(password, 12);
    const result = await runQuery("INSERT INTO users (email, password_hash, full_name) VALUES (?, ?, ?)", [cleanEmail, password_hash, full_name.trim()]);
    const user = { id: result.id, email: cleanEmail, full_name: full_name.trim() };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });
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

    const userRow = await getQuery("SELECT * FROM users WHERE email = ?", [email.toLowerCase().trim()]);
    if (!userRow) return res.status(401).json({ success: false, error: "Invalid email or password." });

    const ok = await bcrypt.compare(password, userRow.password_hash);
    if (!ok) return res.status(401).json({ success: false, error: "Invalid email or password." });

    const user = { id: userRow.id, email: userRow.email, full_name: userRow.full_name };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });
    return res.json({ success: true, token, user });
  } catch (e) {
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

// ── MEDICAL ANALYSIS PROMPT ───────────────────────────────────────
function buildMedicalPrompt(ocrText) {
  return `You are MedIntel AI — an expert medical document analysis system.

STRICT RULES:
1. Analyse ONLY the document visible in the extracted text below.
2. Intelligently reconstruct words that may have slight OCR typos (e.g., "Haemogiobin" -> "Hemoglobin").
3. NEVER invent, assume, or hallucinate any value not present in the text.
4. If a value is missing or unreadable write exactly: "Not Available"
5. Supply standard WHO/ICMR reference ranges where the report omits them.
6. If no medical report content is found respond: {"isMedicalReport": false}

EXTRACTED DOCUMENT TEXT:
"""
${ocrText}
"""

Return ONLY a valid JSON object (no markdown fences) with this exact structure:
{
  "isMedicalReport": true,
  "documentType": "<e.g. Complete Blood Count, LFT, MRI, ECG, Prescription>",
  "section1_patientInformation": {
    "name": "<or Not Available>",
    "age": "<or Not Available>",
    "gender": "<Male / Female / Not Available>",
    "patientId": "<or Not Available>",
    "reportDate": "<or Not Available>",
    "facilityName": "<hospital / lab or Not Available>",
    "doctorName": "<or Not Available>",
    "testType": "<panel name or Not Available>"
  },
  "section2_testSummaryTable": [
    {
      "testName": "<exact test name>",
      "result": "<measured value>",
      "unit": "<unit>",
      "referenceRange": "<from report or WHO/ICMR standard>",
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
    "summary": "<2-3 sentence balanced clinical summary>",
    "healthScore": <integer 0-100>,
    "riskLevel": "<Low | Moderate | High>"
  },
  "section5_possibleCauses": [
    { "abnormalValue": "<test + value>", "causes": ["<cause 1>", "<cause 2>", "<cause 3>"] }
  ],
  "section6_recommendedFollowUp": {
    "repeatTesting": "<timeframe or Not Needed>",
    "additionalInvestigations": ["<test>"],
    "lifestyleMeasures": ["<advice>"],
    "specialistConsultation": "<specialist>"
  },
  "section7_easyExplanation": "<Plain-language patient-friendly summary — no medical jargon>",
  "section8_confidenceScore": {
    "percentage": <integer 0-100>,
    "reasoning": "<Why this confidence level>"
  },
  "disclaimer": "This AI analysis is for educational purposes only. Always consult a qualified medical professional."
}`;
}

// ── /analyze ENDPOINT ─────────────────────────────────────────────
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
      if (!req.file) {
        return res.status(400).json({ success: false, error: "No file uploaded. Please attach a medical document." });
      }

      const originalName = path.basename(req.file.originalname || "document");
      const ext          = path.extname(originalName).toLowerCase();
      let   mimeType     = req.file.mimetype || "application/octet-stream";

      const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".bmp", ".tiff"];
      if ([".jpg", ".jpeg", ".heic"].includes(ext)) mimeType = "image/jpeg";
      else if (ext === ".png")  mimeType = "image/png";
      else if (ext === ".webp") mimeType = "image/webp";
      else if (ext === ".pdf")  mimeType = "application/pdf";

      const isImage = IMAGE_EXTS.includes(ext) || mimeType.startsWith("image/");
      const isPDF   = mimeType === "application/pdf" || ext === ".pdf";

      console.log(`\n📄 [analyze] file=${originalName} | size=${req.file.size}B | mime=${mimeType}`);

      let rawBuffer = fs.readFileSync(filePath);
      let ocrText = "";

      // ── PDF Text Extraction ──────────────────────────────────────
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

      // ── Dual-Pass Sharp Image Pre-Processing & Tesseract OCR ─────
      if (isImage) {
        try {
          console.log("   🔍 Running Dual-Pass Sharp OCR...");

          // Pass 1: Grayscale & normalize (captures patient info & headers)
          const pass1Buf = await sharp(rawBuffer)
            .rotate()
            .resize({ width: 2400, fit: "inside", withoutEnlargement: false })
            .grayscale()
            .normalize()
            .toBuffer();

          // Pass 2: High-contrast linear stretch (captures faint numbers & small text)
          const pass2Buf = await sharp(rawBuffer)
            .rotate()
            .resize({ width: 2400, fit: "inside", withoutEnlargement: false })
            .grayscale()
            .linear(1.8, -40)
            .sharpen({ sigma: 1.5 })
            .toBuffer();

          const [ocr1, ocr2] = await Promise.all([
            Tesseract.recognize(pass1Buf, "eng", { logger: () => {} }),
            Tesseract.recognize(pass2Buf, "eng", { logger: () => {} }),
          ]);

          const t1 = (ocr1.data.text || "").trim();
          const t2 = (ocr2.data.text || "").trim();

          ocrText = `${t1}\n\n--- HIGH CONTRAST PASS ---\n\n${t2}`;
          console.log(`   ✅ Dual-Pass OCR complete: ${ocrText.length} total chars`);

        } catch (ocrErr) {
          console.error("   ⚠️ Dual-Pass OCR failed:", ocrErr.message);
        }
      }

      if (!ocrText.trim()) {
        ocrText = `[No readable text extracted from file: ${originalName}]`;
      }

      const promptText = buildMedicalPrompt(ocrText.substring(0, 12000));
      let responseText = "";

      // ── 1. Gemini Vision (if valid key present) ─────────────────
      if (googleAI && isImage) {
        try {
          console.log("   ⚡ Calling Gemini 2.0 Flash Vision...");
          const geminiRes = await googleAI.models.generateContent({
            model: "gemini-2.0-flash",
            contents: [
              {
                role: "user",
                parts: [
                  { inlineData: { mimeType: "image/jpeg", data: rawBuffer.toString("base64") } },
                  { text: promptText },
                ],
              },
            ],
            config: { generationConfig: { responseMimeType: "application/json" } },
          });
          responseText = geminiRes.text || "";
          if (responseText) console.log("   ✅ Gemini Vision success!");
        } catch (geminiErr) {
          console.error("   ⚠️ Gemini Vision failed, using Dual-Pass Groq:", geminiErr.message);
        }
      }

      // ── 2. Groq Llama 3.3 70B (Primary / Fallback Engine) ─────────
      if (!responseText && groq) {
        try {
          console.log("   ⚡ Calling Groq Llama 3.3 70B...");
          const groqRes = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: promptText }],
            response_format: { type: "json_object" },
            max_tokens: 4096,
            temperature: 0.1,
          });
          responseText = groqRes.choices[0]?.message?.content || "";
          if (responseText) console.log("   ✅ Groq Llama 3.3 success!");
        } catch (groqErr) {
          console.error("   ❌ Groq error:", groqErr.message);
        }
      }

      if (!responseText) {
        return res.status(503).json({ success: false, error: "AI services unavailable. Please try again." });
      }

      // ── Parse & Validate JSON ────────────────────────────────────
      let parsed;
      try {
        const clean = responseText
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/```\s*$/i, "")
          .trim();
        parsed = JSON.parse(clean);
      } catch (parseErr) {
        return res.status(500).json({ success: false, error: "AI returned invalid JSON." });
      }

      if (parsed.isMedicalReport === false) {
        return res.status(400).json({ success: false, error: "No medical report detected in the uploaded file." });
      }

      const elapsedMs = Date.now() - t0;

      // Save to DB
      if (req.user?.id) {
        try {
          const hs = Number(parsed.section4_overallAssessment?.healthScore || parsed.healthScore) || 75;
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
      console.error("❌ /analyze unhandled error:", err);
      return res.status(500).json({ success: false, error: err.message || "Analysis failed." });
    } finally {
      if (filePath && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_) {}
      }
    }
  }
);

// ── AI CHAT ───────────────────────────────────────────────────────
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

    let ctxBlock = "";
    if (reportContext && typeof reportContext === "object") {
      ctxBlock = `
PATIENT REPORT CONTEXT:
- Patient: ${reportContext.patientInfo?.name || "Unknown"} | Age: ${reportContext.patientInfo?.age || "N/A"} | Gender: ${reportContext.patientInfo?.gender || "N/A"}
- Health Score: ${reportContext.healthScore ?? "N/A"}/100 | Risk: ${reportContext.riskLevel || "Unknown"}
- Summary: ${reportContext.summaryPatientFriendly || "N/A"}
- Abnormal Values: ${JSON.stringify(reportContext.alerts || [])}
- All Biomarkers: ${JSON.stringify(reportContext.biomarkers || [])}
`;
    }

    const systemPrompt = `You are MedIntel AI, a compassionate expert medical assistant.\n${ctxBlock}\nRULES:\n- Reference the patient's actual report data when answering.\n- Keep replies structured, helpful, and empathetic. Always recommend consulting a qualified doctor.`;

    let reply = "";
    if (groq) {
      try {
        const r = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemPrompt },
            ...safeMessages.map(m => ({ role: m.role, content: m.content })),
          ],
        });
        reply = r.choices[0]?.message?.content || "";
      } catch (e) {
        console.error("Groq chat error:", e.message);
      }
    }

    if (!reply) reply = "AI chat is temporarily unavailable. Please try again.";

    if (req.user?.id) {
      try {
        const lastUser = safeMessages[safeMessages.length - 1].content;
        await runQuery("INSERT INTO chat_messages (user_id, role, content) VALUES (?, ?, ?)", [req.user.id, "user", lastUser]);
        await runQuery("INSERT INTO chat_messages (user_id, role, content) VALUES (?, ?, ?)", [req.user.id, "assistant", reply]);
      } catch (_) {}
    }

    return res.json({ success: true, message: { role: "assistant", content: reply } });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Chat service error." });
  }
});

// ── SAVED REPORTS & CHAT HISTORY ─────────────────────────────────
app.get("/api/reports", authenticateToken, async (req, res) => {
  try {
    const rows = await allQuery(
      "SELECT id, filename, analysis_data, health_score, created_at FROM analyses WHERE user_id = ? ORDER BY created_at DESC",
      [req.user.id]
    );
    const reports = rows.map(r => ({ id: r.id, filename: r.filename, analysis: JSON.parse(r.analysis_data), health_score: r.health_score, created_at: r.created_at }));
    return res.json({ success: true, reports });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Failed to retrieve reports." });
  }
});

app.get("/api/chat/history", authenticateToken, async (req, res) => {
  try {
    const rows = await allQuery("SELECT role, content, created_at FROM chat_messages WHERE user_id = ? ORDER BY id ASC", [req.user.id]);
    return res.json({ success: true, messages: rows });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Failed to retrieve chat history." });
  }
});

// ── SPA FALLBACK ──────────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.method === "GET" && !req.path.startsWith("/api") && req.path !== "/analyze") {
    const idx = path.resolve("dist", "index.html");
    if (fs.existsSync(idx)) return res.sendFile(idx);
  }
  next();
});

// ── START ─────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 5001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n✅ MedIntel running on http://0.0.0.0:${PORT}`);
});
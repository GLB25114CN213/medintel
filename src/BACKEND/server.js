import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
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
import db, { runQuery, getQuery, allQuery } from "./db.js";
import { authenticateToken, optionalAuthenticateToken } from "./authMiddleware.js";

dotenv.config();

const app = express();

// ----------------------------------------------------
// SECURITY HEADERS & HYGIENE (Helmet & CORS)
// ----------------------------------------------------

app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "http://localhost:5001", "http://127.0.0.1:5001"],
        fontSrc: ["'self'", "https:", "data:"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(cors({
  origin: true,
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "1mb" }));

// ----------------------------------------------------
// RATE LIMITING
// ----------------------------------------------------

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { success: false, error: "Too many login/registration attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, error: "AI request rate limit exceeded. Please wait a few minutes before trying again." },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, error: "Too many requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/", generalLimiter);

// ----------------------------------------------------
// SECURE FILE UPLOAD CONFIGURATION (Multer)
// ----------------------------------------------------

const uploadDir = path.resolve("uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/bmp",
  "text/plain",
  "text/csv",
  "application/octet-stream"
]);

const ALLOWED_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".bmp", ".txt", ".csv", ""]);

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const mime = (file.mimetype || "").toLowerCase();

    if (ALLOWED_MIME_TYPES.has(mime) || ALLOWED_EXTENSIONS.has(ext) || mime.startsWith("image/") || mime.startsWith("text/")) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file format. Please upload a PDF or an image (JPG, PNG, WebP, HEIC)."));
    }
  }
});

// ----------------------------------------------------
// SECURE API KEYS & JWT SETUP
// ----------------------------------------------------

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString("hex");

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
const googleAI = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

console.log("⚡ MedIntel High-Speed Production Backend Initializing...");
console.log("  - Ultra-Fast Gemini 2.5 Flash Vision Pipeline: Active (~2s latency)");
console.log("  - Google AI Studio (Gemini 2.5 Flash):", googleAI ? "Enabled" : "Disabled");
console.log("  - Groq AI SDK Fallback:", groq ? "Enabled" : "Disabled");

// Serve frontend static assets safely
const distDir = path.resolve("dist");
if (fs.existsSync(distDir)) {
  console.log("📦 Serving compiled production frontend from dist/");
  app.use(express.static(distDir));
}

// Input Validation Helpers
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRegistrationInput(email, password, full_name) {
  if (!email || !password || !full_name) {
    return "All fields (email, password, full_name) are required.";
  }
  if (typeof email !== "string" || email.length > 254 || !EMAIL_REGEX.test(email.trim())) {
    return "Please enter a valid email address.";
  }
  if (typeof full_name !== "string" || full_name.trim().length < 2 || full_name.length > 100) {
    return "Full name must be between 2 and 100 characters.";
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    return "Password must be between 8 and 128 characters.";
  }
  return null;
}

// ----------------------------------------------------
// AUTHENTICATION ENDPOINTS
// ----------------------------------------------------

app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const { email, password, full_name } = req.body;

    const validationError = validateRegistrationInput(email, password, full_name);
    if (validationError) {
      return res.status(400).json({ success: false, error: validationError });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanName = full_name.trim();

    const existingUser = await getQuery("SELECT id FROM users WHERE email = ?", [cleanEmail]);
    if (existingUser) {
      return res.status(400).json({ success: false, error: "An account with this email already exists." });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const result = await runQuery(
      "INSERT INTO users (email, password_hash, full_name) VALUES (?, ?, ?)",
      [cleanEmail, password_hash, cleanName]
    );

    const user = { id: result.id, email: cleanEmail, full_name: cleanName };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });

    console.log("👤 New user registered:", user.email);
    return res.json({ success: true, token, user });
  } catch (error) {
    console.error("❌ Register Error:", error);
    return res.status(500).json({ success: false, error: "Registration failed due to a server error." });
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ success: false, error: "Email and password are required." });
    }

    const cleanEmail = email.toLowerCase().trim();
    const userInDb = await getQuery("SELECT * FROM users WHERE email = ?", [cleanEmail]);
    if (!userInDb) {
      return res.status(401).json({ success: false, error: "Invalid email or password." });
    }

    const validPassword = await bcrypt.compare(password, userInDb.password_hash);
    if (!validPassword) {
      return res.status(401).json({ success: false, error: "Invalid email or password." });
    }

    const user = { id: userInDb.id, email: userInDb.email, full_name: userInDb.full_name };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });

    console.log("🔓 User logged in:", user.email);
    return res.json({ success: true, token, user });
  } catch (error) {
    console.error("❌ Login Error:", error);
    return res.status(500).json({ success: false, error: "Login failed due to a server error." });
  }
});

app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const userInDb = await getQuery("SELECT id, email, full_name, created_at FROM users WHERE id = ?", [req.user.id]);
    if (!userInDb) {
      return res.status(404).json({ success: false, error: "User profile not found." });
    }
    return res.json({ success: true, user: userInDb });
  } catch (error) {
    console.error("❌ Auth Me Error:", error);
    return res.status(500).json({ success: false, error: "Failed to retrieve user profile." });
  }
});

// ----------------------------------------------------
// ULTRA-FAST MULTI-MODAL AI REPORT ANALYZER ENDPOINT
// ----------------------------------------------------

app.post("/analyze", aiLimiter, optionalAuthenticateToken, (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message || "File upload rejected." });
    }
    next();
  });
}, async (req, res) => {
  const startTime = Date.now();
  let filePath = req.file?.path;

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded." });
    }

    const originalName = path.basename(req.file.originalname);
    console.log("📄 File received:", originalName, "| MimeType:", req.file.mimetype);

    let extractedText = "";
    const fileBuffer = fs.readFileSync(filePath);
    const fileBase64 = fileBuffer.toString("base64");
    const mimeType = req.file.mimetype || "";
    const ext = path.extname(originalName).toLowerCase();

    // 1. If PDF or Text, quickly extract raw text
    if (mimeType === "application/pdf" || ext === ".pdf") {
      try {
        const parseFunc = typeof pdfParse === "function" ? pdfParse : pdfParse.default;
        const pdfData = await parseFunc(fileBuffer);
        extractedText = pdfData.text || "";
      } catch (pdfErr) {
        console.error("⚠️ PDF text extraction warning:", pdfErr.message);
      }
    } else if (mimeType.startsWith("text/") || ext === ".txt" || ext === ".csv") {
      extractedText = fileBuffer.toString("utf8");
    }

    const sanitizedExtractedText = extractedText.substring(0, 8000);

    const promptText = `
You are MedIntel AI, an expert OCR, handwriting analysis, and comprehensive medical report assistant.

TASK INSTRUCTIONS FOR HANDWRITTEN & BLURRY REPORTS:
1. Carefully inspect every part of the image/document visually before responding.
2. Enhance legibility mentally by analyzing stroke direction, contrast, edges, and clinical context.
3. Read handwritten doctor notes, scribbled prescriptions, low-resolution scans, skewed pages, and faded ink accurately.
4. If a handwritten word or value is unclear:
   - Infer it only when strong contextual evidence exists: [likely: word].
   - If text cannot be determined confidently: [unclear]. Do NOT invent words.
   - If multiple interpretations exist: [possible: "value1" or "value2"].
5. Extract ALL sections of medical findings from this document.

DOCUMENT TEXT EXTRACTED SO FAR:
${sanitizedExtractedText}

Return STRICT JSON matching this exact structure:
{
  "isMedicalReport": true,
  "patientName": "Patient Name or Unspecified",
  "age": "34",
  "gender": "Male / Female / Unspecified",
  "reportDate": "Report date or Unspecified",
  "facilityName": "Hospital / Laboratory Name",
  "doctorName": "Doctor / Physician Name",
  "healthScore": 75,
  "healthScoreReason": "Detailed explanation for health score based on biomarkers and clinical findings.",
  "riskLevel": "Moderate",
  "summary": "Clinical summary of the patient report.",
  "simpleExplanation": "Easy to understand patient-friendly explanation.",
  "professionalExplanation": "Detailed technical medical analysis.",
  "diagnoses": ["Primary Diagnosis", "Secondary Finding"],
  "symptomsIdentified": ["Symptom 1", "Symptom 2"],
  "abnormalFindings": [
    { "name": "Biomarker Name", "value": "Abnormal Value", "severity": "High" }
  ],
  "biomarkers": [
    {
      "name": "Biomarker Name",
      "value": "12.5",
      "unit": "mg/dL",
      "status": "High",
      "normalRange": "12.0 - 15.0",
      "meaning": "Clinical meaning",
      "confidence": "High"
    }
  ],
  "medicines": [
    {
      "name": "Medicine Name",
      "dose": "500mg",
      "frequency": "Once daily",
      "duration": "7 days",
      "purpose": "Purpose of medication",
      "instructions": "Take after meals",
      "confidence": "High"
    }
  ],
  "radiologyFindings": ["X-Ray / CT / Ultrasound observation if present"],
  "recommendations": ["Recommendation 1"],
  "lifestyleRecommendations": ["Lifestyle advice 1"],
  "dietRecommendations": ["Nutrition advice 1"],
  "foodsToAvoid": ["Foods to avoid 1"],
  "supplementRecommendations": ["Vitamin D3 60,000 IU"],
  "followUpTests": ["Follow up lab test 1"],
  "doctorQuestions": ["Question for doctor 1"],
  "doctorSuggestion": "General Physician / Medical Specialist",
  "imageQualityNotes": "Legibility assessment summary: Handwriting clarity, contrast, and OCR confidence notes.",
  "disclaimer": "This AI analysis is for educational purposes only. Consult a qualified medical doctor."
}
`;

    let responseText = "";

    // FAST PATH: Direct Multi-Modal Vision via Gemini 2.5 Flash (~2 seconds)
    if (googleAI) {
      try {
        console.log("⚡ [FAST PATH] Executing Direct Gemini 2.5 Flash Vision Analysis...");
        
        const contentsPayload = [
          {
            inlineData: {
              mimeType: mimeType.startsWith("image/") ? mimeType : (mimeType === "application/pdf" ? "application/pdf" : "image/jpeg"),
              data: fileBase64
            }
          },
          promptText
        ];

        const geminiRes = await googleAI.models.generateContent({
          model: "gemini-2.5-flash",
          contents: contentsPayload,
          config: { responseMimeType: "application/json" }
        });
        responseText = geminiRes.text;
      } catch (gErr) {
        console.error("⚠️ Direct Gemini Vision error, attempting text prompt fallback:", gErr.message);
      }
    }

    // FALLBACK PATH: If Gemini Vision failed, try Tesseract OCR + Groq
    if (!responseText) {
      console.log("🐢 [FALLBACK PATH] Running CPU Tesseract OCR & Groq Fallback...");
      if (!extractedText.trim() && (mimeType.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp"].includes(ext))) {
        try {
          const processedBuffer = await sharp(filePath)
            .resize({ width: 1500, withoutEnlargement: true })
            .grayscale()
            .toBuffer();
          const ocrResult = await Tesseract.recognize(processedBuffer, "eng");
          extractedText = ocrResult.data.text || "";
        } catch (ocrErr) {
          console.error("⚠️ Tesseract OCR fallback error:", ocrErr.message);
        }
      }

      if (groq) {
        const groqRes = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: promptText }],
          response_format: { type: "json_object" },
        });
        responseText = groqRes.choices[0].message.content;
      }
    }

    if (!responseText) {
      throw new Error("Unable to contact AI analysis services.");
    }

    responseText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(responseText);

    const elapsedMs = Date.now() - startTime;
    console.log(`✅ Analysis completed in ${elapsedMs}ms (${(elapsedMs / 1000).toFixed(2)}s)`);

    // Save to DB if user is logged in
    if (req.user && req.user.id) {
      try {
        await runQuery(
          "INSERT INTO analyses (user_id, filename, analysis_data, health_score) VALUES (?, ?, ?, ?)",
          [req.user.id, originalName, JSON.stringify(parsed), Number(parsed.healthScore) || 75]
        );
      } catch (dbErr) {
        console.error("⚠️ Failed to save analysis to DB:", dbErr.message);
      }
    }

    return res.json({ success: true, analysis: parsed, latencyMs: elapsedMs });
  } catch (error) {
    console.error("❌ ERROR in /analyze:", error);
    return res.status(500).json({ success: false, error: "An error occurred while analyzing the medical report." });
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) {}
    }
  }
});

// ----------------------------------------------------
// PRODUCTION REAL-TIME AI CHAT ENDPOINT
// ----------------------------------------------------

app.post("/api/chat", aiLimiter, optionalAuthenticateToken, async (req, res) => {
  try {
    const { messages, reportContext } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: "Messages array is required." });
    }

    const sanitizedMessages = messages.slice(-10).map(m => ({
      role: m.role === "user" ? "user" : "assistant",
      content: typeof m.content === "string" ? m.content.substring(0, 2000) : ""
    }));

    const lastUserMessage = sanitizedMessages[sanitizedMessages.length - 1].content;

    let contextPrompt = "";
    if (reportContext && typeof reportContext === "object") {
      contextPrompt = `
PATIENT MEDICAL REPORT CONTEXT:
- Patient Name: ${reportContext.patientInfo?.name || 'Patient'} (Age: ${reportContext.patientInfo?.age || 'N/A'}, Gender: ${reportContext.patientInfo?.gender || 'N/A'})
- Health Score: ${reportContext.healthScore || 'N/A'}/100 (${reportContext.riskLevel || 'Normal'} Risk)
- Clinical Summary: ${reportContext.summaryPatientFriendly || reportContext.summary || 'None'}
- Diagnoses: ${JSON.stringify(reportContext.diagnoses || [])}
- Abnormal Findings: ${JSON.stringify(reportContext.alerts || reportContext.abnormalFindings || [])}
- Biomarkers: ${JSON.stringify(reportContext.biomarkers || [])}
- Prescribed Medicines: ${JSON.stringify(reportContext.medicines || [])}
- Doctor Suggestions: ${reportContext.doctorSuggestion || 'N/A'}
`;
    }

    const chatSystemInstruction = `
You are MedIntel AI, a compassionate, highly knowledgeable, and clinical medical AI assistant.
Your goal is to explain health metrics, medical report findings, lab test values, medications, lifestyle changes, and answer patient questions clearly.

${contextPrompt}

INSTRUCTIONS:
1. Provide accurate, empathetic, and structured medical explanations.
2. Directly reference the patient's report findings whenever relevant.
3. Keep answers concise, clear, and easy to understand for patients.
4. Always emphasize that this AI guidance is educational and recommend consulting a doctor.
`;

    const conversationHistory = sanitizedMessages.map(m => `${m.role === 'user' ? 'Patient' : 'MedIntel AI'}: ${m.content}`).join("\n\n");
    const fullChatPrompt = `${chatSystemInstruction}\n\nCONVERSATION HISTORY:\n${conversationHistory}\n\nMedIntel AI:`;

    let replyText = "";

    // 1. Try Google AI Studio Gemini 2.5 Flash
    if (googleAI) {
      try {
        const geminiChatRes = await googleAI.models.generateContent({
          model: "gemini-2.5-flash",
          contents: fullChatPrompt,
        });
        replyText = geminiChatRes.text;
      } catch (gErr) {
        console.error("⚠️ Gemini Chat error, trying Groq fallback:", gErr.message);
      }
    }

    // 2. Fallback to Groq
    if (!replyText && groq) {
      const groqChatRes = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: chatSystemInstruction },
          ...sanitizedMessages.map(m => ({ role: m.role, content: m.content }))
        ],
      });
      replyText = groqChatRes.choices[0].message.content;
    }

    if (!replyText) {
      replyText = "I'm sorry, I encountered an issue connecting to the medical AI service. Please try again.";
    }

    // Save message to DB if user is logged in
    if (req.user && req.user.id) {
      try {
        await runQuery("INSERT INTO chat_messages (user_id, role, content) VALUES (?, ?, ?)", [req.user.id, "user", lastUserMessage]);
        await runQuery("INSERT INTO chat_messages (user_id, role, content) VALUES (?, ?, ?)", [req.user.id, "assistant", replyText]);
      } catch (e) {
        // Ignored
      }
    }

    return res.json({
      success: true,
      message: { role: "assistant", content: replyText }
    });

  } catch (error) {
    console.error("❌ ERROR in /api/chat:", error);
    return res.status(500).json({ success: false, error: "Chat service encountered an internal error." });
  }
});

// ----------------------------------------------------
// SAVED REPORTS & CHAT HISTORY ENDPOINTS
// ----------------------------------------------------

app.get("/api/reports", authenticateToken, async (req, res) => {
  try {
    const rows = await allQuery("SELECT id, filename, analysis_data, health_score, created_at FROM analyses WHERE user_id = ? ORDER BY created_at DESC", [req.user.id]);
    const reports = rows.map(r => ({
      id: r.id,
      filename: r.filename,
      analysis: JSON.parse(r.analysis_data),
      health_score: r.health_score,
      created_at: r.created_at
    }));
    return res.json({ success: true, reports });
  } catch (error) {
    console.error("❌ Get Reports Error:", error);
    return res.status(500).json({ success: false, error: "Failed to retrieve saved reports." });
  }
});

app.get("/api/chat/history", authenticateToken, async (req, res) => {
  try {
    const rows = await allQuery("SELECT role, content, created_at FROM chat_messages WHERE user_id = ? ORDER BY id ASC", [req.user.id]);
    return res.json({ success: true, messages: rows });
  } catch (error) {
    console.error("❌ Get Chat History Error:", error);
    return res.status(500).json({ success: false, error: "Failed to retrieve chat history." });
  }
});

// SPA Fallback Route
if (fs.existsSync(distDir)) {
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api") && req.path !== "/analyze") {
      return res.sendFile(path.join(distDir, "index.html"));
    }
    next();
  });
}

export default app;

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5001;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 MedIntel High-Speed Production Backend running on port ${PORT}`);
  });
}
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
import db, { runQuery, getQuery, allQuery } from "./db.js";
import { authenticateToken, optionalAuthenticateToken, JWT_SECRET } from "./authMiddleware.js";

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
        defaultSrc: ["'self'", "*"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
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
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Serve compiled production frontend statically
const distDir = path.resolve("dist");
if (fs.existsSync(distDir)) {
  console.log("📦 Serving compiled production frontend from dist/");
  app.use(express.static(distDir));
}

// ----------------------------------------------------
// RATE LIMITING
// ----------------------------------------------------

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, error: "Too many login/registration attempts. Please try again in a few minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, error: "AI request rate limit exceeded. Please wait a few minutes before trying again." },
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

// ----------------------------------------------------
// FILE UPLOAD CONFIGURATION (Multer)
// ----------------------------------------------------

const uploadDir = path.resolve("uploads");
if (!fs.existsSync(uploadDir)) {
  try { fs.mkdirSync(uploadDir, { recursive: true }); } catch (e) {}
}

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB max
    files: 1
  },
  fileFilter: (req, file, cb) => {
    cb(null, true);
  }
});

// ----------------------------------------------------
// SECURE API KEYS SETUP
// ----------------------------------------------------

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
const googleAI = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

console.log("🚀 MedIntel Production Backend Initializing...");
console.log("  - Google AI Studio (Gemini 2.5 Flash):", googleAI ? "Enabled" : "Disabled");
console.log("  - Groq AI SDK (Llama 3.3 70B):", groq ? "Enabled" : "Disabled");

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
// MULTI-MODAL AI REPORT ANALYZER ENDPOINT
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

    const originalName = path.basename(req.file.originalname || "medical_report");
    console.log("📄 File received:", originalName, "| MimeType:", req.file.mimetype, "| Size:", req.file.size);

    let extractedText = "";
    const fileBuffer = fs.readFileSync(filePath);
    const fileBase64 = fileBuffer.toString("base64");
    const mimeType = req.file.mimetype || "image/jpeg";
    const ext = path.extname(originalName).toLowerCase();

    // 1. Extract text from PDF if applicable
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

    // 2. OCR via Tesseract if needed
    if (!extractedText.trim() && (mimeType.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp", ".heic", ".bmp"].includes(ext))) {
      try {
        let processedBuffer = fileBuffer;
        if (sharp) {
          try {
            processedBuffer = await sharp(fileBuffer)
              .resize({ width: 1500, withoutEnlargement: true })
              .grayscale()
              .toBuffer();
          } catch (e) {}
        }
        const ocrResult = await Tesseract.recognize(processedBuffer, "eng");
        extractedText = ocrResult.data.text || "";
      } catch (ocrErr) {
        console.error("⚠️ OCR warning:", ocrErr.message);
      }
    }

    if (!extractedText.trim()) {
      extractedText = `Medical Report Document Attached. File Name: ${originalName}`;
    }

    const sanitizedExtractedText = extractedText.substring(0, 8000);

    const promptText = `
You are MedIntel AI, an expert clinical medical report assistant.

Analyze this medical document content accurately:
${sanitizedExtractedText}

Return STRICT JSON matching this exact structure:
{
  "isMedicalReport": true,
  "patientName": "Patient Name or Unspecified",
  "age": "34",
  "gender": "Male / Female / Unspecified",
  "reportDate": "Report date or Unspecified",
  "facilityName": "Hospital / Laboratory Name",
  "doctorName": "Attending Physician",
  "healthScore": 75,
  "healthScoreReason": "Health score evaluated from biomarkers and findings.",
  "riskLevel": "Moderate",
  "summary": "Clinical summary of findings.",
  "simpleExplanation": "Easy to understand patient-friendly explanation.",
  "professionalExplanation": "Technical clinical evaluation.",
  "diagnoses": ["Primary Diagnosis"],
  "symptomsIdentified": ["Identified Symptom"],
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
      "frequency": "Daily",
      "duration": "7 days",
      "purpose": "Purpose",
      "instructions": "Take after meals",
      "confidence": "High"
    }
  ],
  "radiologyFindings": ["X-Ray / CT / Ultrasound observation if present"],
  "recommendations": ["Recommendation 1"],
  "lifestyleRecommendations": ["Lifestyle advice"],
  "dietRecommendations": ["Nutrition advice"],
  "doctorQuestions": ["Question for doctor"],
  "doctorSuggestion": "General Physician",
  "disclaimer": "This AI analysis is for educational purposes only. Consult a doctor."
}
`;

    let responseText = "";

    // 1. Try Gemini Vision multi-modal path first
    if (googleAI) {
      try {
        console.log("⚡ Executing Gemini 2.5 Flash Vision Analysis...");
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
        console.error("⚠️ Gemini Vision error, falling back to Groq:", gErr.message);
      }
    }

    // 2. Groq AI Fallback Path (Sub-1s Latency)
    if (!responseText && groq) {
      try {
        console.log("⚡ Executing Groq Llama 3.3 70B AI Analysis...");
        const groqRes = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: promptText }],
          response_format: { type: "json_object" },
        });
        responseText = groqRes.choices[0].message.content;
      } catch (groqErr) {
        console.error("⚠️ Groq API error:", groqErr.message);
      }
    }

    if (!responseText) {
      return res.status(500).json({
        success: false,
        error: "Unable to contact AI analysis services. Please try again."
      });
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
      } catch (dbErr) {}
    }

    return res.json({ success: true, analysis: parsed, latencyMs: elapsedMs });
  } catch (error) {
    console.error("❌ ERROR in /analyze:", error);
    return res.status(500).json({ success: false, error: error.message || "An error occurred while analyzing the medical report." });
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

    // 1. Try Gemini first
    if (googleAI) {
      try {
        const geminiChatRes = await googleAI.models.generateContent({
          model: "gemini-2.5-flash",
          contents: fullChatPrompt,
        });
        replyText = geminiChatRes.text;
      } catch (gErr) {}
    }

    // 2. Groq AI Fallback
    if (!replyText && groq) {
      try {
        const groqChatRes = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: chatSystemInstruction },
            ...sanitizedMessages.map(m => ({ role: m.role, content: m.content }))
          ],
        });
        replyText = groqChatRes.choices[0].message.content;
      } catch (e) {}
    }

    if (!replyText) {
      replyText = "I'm sorry, I encountered an issue connecting to the medical AI service. Please try again.";
    }

    // Save message to DB if user is logged in
    if (req.user && req.user.id) {
      try {
        await runQuery("INSERT INTO chat_messages (user_id, role, content) VALUES (?, ?, ?)", [req.user.id, "user", lastUserMessage]);
        await runQuery("INSERT INTO chat_messages (user_id, role, content) VALUES (?, ?, ?)", [req.user.id, "assistant", replyText]);
      } catch (e) {}
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

// ----------------------------------------------------
// SPA FALLBACK ROUTE FOR EXPRESS 5 & RENDER SERVERS
// ----------------------------------------------------

app.use((req, res, next) => {
  if (req.method === "GET" && !req.path.startsWith("/api") && req.path !== "/analyze") {
    const indexPath = path.resolve("dist", "index.html");
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
  }
  next();
});

const PORT = process.env.PORT || 5001;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 MedIntel Production Backend running on port ${PORT}`);
});
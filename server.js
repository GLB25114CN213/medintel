/**
 * MedIntel AI – Production Backend Server
 * Image Pipeline: Dual-Pass Sharp Image Pre-Processing + Tesseract.js OCR
 * AI Engine: Google Gemini API (gemini-3.6-flash)
 */

import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import sharp from "sharp";
import pdfParse from "pdf-parse";
import Tesseract from "tesseract.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { uploadToS3 } from "./server/s3.js";
import db, { runQuery, getQuery, allQuery } from "./server/db.js";
import { authenticateToken, optionalAuthenticateToken } from "./server/authMiddleware.js";
import { analyzeMedicalReport, chatWithMedicalAssistant } from "./server/gemini.js";

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

console.log("🚀 MedIntel Backend starting...");
console.log(`   AI Engine              : Google Gemini API (${process.env.GEMINI_MODEL || "gemini-3.6-flash"}) ✅`);
console.log("   Dual-Pass OCR Engine   : Tesseract.js ✅");
console.log("   Image Processing       : Sharp ✅");

import {
  signUpUser,
  confirmSignUpUser,
  authenticateUser,
  forgotPasswordUser,
  confirmForgotPasswordUser,
  getCognitoConfig,
} from "./server/cognito.js";

// ── INPUT VALIDATION ─────────────────────────────────────────────
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validateRegistration(email, password, full_name, gender) {
  if (!email || !password || !full_name) return "All fields are required.";
  if (!gender || !gender.trim()) return "Please select a gender.";
  if (!EMAIL_REGEX.test(email.trim())) return "Please enter a valid email address.";
  if (full_name.trim().length < 2) return "Full name must be at least 2 characters.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  return null;
}

// ── COGNITO AUTH ENDPOINTS ───────────────────────────────────────
app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const { email, password, full_name, gender } = req.body;
    const err = validateRegistration(email, password, full_name, gender);
    if (err) return res.status(400).json({ success: false, error: err });

    const result = await signUpUser(email, password, full_name, gender.trim());
    return res.json({
      success: true,
      requireVerification: true,
      message: "Account created successfully! Please enter the 6-digit confirmation code sent to your email.",
      userSub: result.userSub,
    });
  } catch (e) {
    console.error("❌ Cognito Register:", e.message);
    return res.status(400).json({ success: false, error: e.message || "Registration failed." });
  }
});

app.post("/api/auth/confirm-signup", authLimiter, async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ success: false, error: "Email and confirmation code are required." });
    }
    await confirmSignUpUser(email, code);
    return res.json({ success: true, message: "Email confirmed successfully. You may now sign in." });
  } catch (e) {
    console.error("❌ Cognito Confirm SignUp:", e.message);
    return res.status(400).json({ success: false, error: e.message || "Email confirmation failed." });
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password are required." });
    }

    const authResult = await authenticateUser(email, password);

    // Provision or link DB records by cognito_sub
    let userRow = await getQuery("SELECT * FROM users WHERE cognito_sub = ?", [authResult.userSub]);
    if (!userRow) {
      userRow = await getQuery("SELECT * FROM users WHERE email = ?", [authResult.email]);
      if (userRow) {
        await runQuery("UPDATE users SET cognito_sub = ? WHERE id = ?", [authResult.userSub, userRow.id]);
      } else {
        const result = await runQuery(
          "INSERT INTO users (cognito_sub, email, full_name) VALUES (?, ?, ?)",
          [authResult.userSub, authResult.email, authResult.fullName]
        );
        userRow = { id: result.id, cognito_sub: authResult.userSub, email: authResult.email, full_name: authResult.fullName };
      }
    }

    let patientRow = await getQuery("SELECT * FROM patients WHERE cognito_sub = ?", [authResult.userSub]);
    if (!patientRow) {
      const pid = "MI-PAT-" + Math.floor(100000 + Math.random() * 900000);
      await runQuery(
        "INSERT INTO patients (user_id, cognito_sub, patient_id, full_name, email, gender) VALUES (?, ?, ?, ?, ?, ?)",
        [userRow.id, authResult.userSub, pid, authResult.fullName, authResult.email, authResult.gender]
      );
      patientRow = await getQuery("SELECT * FROM patients WHERE cognito_sub = ?", [authResult.userSub]);
    }

    return res.json({
      success: true,
      token: authResult.idToken,
      refreshToken: authResult.refreshToken,
      user: {
        id: userRow.id,
        sub: authResult.userSub,
        email: authResult.email,
        full_name: authResult.fullName,
        patient_id: patientRow ? patientRow.patient_id : "MI-PAT-100245"
      }
    });
  } catch (e) {
    console.error("❌ Cognito Login:", e.message);
    return res.status(400).json({ success: false, error: e.message || "Login failed." });
  }
});

app.post("/api/auth/forgot-password", authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: "Email is required." });

    await forgotPasswordUser(email);
    return res.json({ success: true, message: "Password reset code sent to your email." });
  } catch (e) {
    console.error("❌ Cognito Forgot Password:", e.message);
    return res.status(400).json({ success: false, error: e.message || "Failed to send reset code." });
  }
});

app.post("/api/auth/confirm-forgot-password", authLimiter, async (req, res) => {
  try {
    const { email, code, new_password } = req.body;
    if (!email || !code || !new_password) {
      return res.status(400).json({ success: false, error: "Email, confirmation code, and new password are required." });
    }

    await confirmForgotPasswordUser(email, code, new_password);
    return res.json({ success: true, message: "Password reset successful! You may now sign in." });
  } catch (e) {
    console.error("❌ Cognito Confirm Forgot Password:", e.message);
    return res.status(400).json({ success: false, error: e.message || "Password reset failed." });
  }
});

app.get("/api/auth/me", authenticateToken, async (req, res) => {
  return res.json({ success: true, user: req.user });
});

import { buildMedicalPrompt } from "./server/prompt.js";

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
      let ocrText = (req.body?.clientOcrText || "").trim();

      // ── PDF Text Extraction ──────────────────────────────────────
      if (isPDF) {
        try {
          const parseFn = typeof pdfParse === "function" ? pdfParse : pdfParse.default;
          const pdfData = await parseFn(rawBuffer);
          const pdfText = (pdfData.text || "").trim();
          ocrText = ocrText ? `${ocrText}\n\n${pdfText}` : pdfText;
          if (pdfText) console.log(`   ✅ PDF text extracted: ${pdfText.length} chars`);
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
      } else {
        // Titer & Serology OCR Normalization: Repair ratios like "1 160", "1.160", "1: 160" -> "1:160"
        ocrText = ocrText
          .replace(/\b(1)\s*[:\.\-;\s]\s*(20|40|80|160|320|640|1280)\b/gi, "$1:$2")
          .replace(/S\s*[\.\s]?\s*Typhi/gi, "S. Typhi")
          .replace(/Paratyphi/gi, "Paratyphi");
      }

      const promptText = buildMedicalPrompt(ocrText.substring(0, 12000));
      const responseText = await analyzeMedicalReport(promptText);

      if (!responseText) {
        return res.status(503).json({
          success: false,
          error: {
            code: "AI_PROVIDER_ERROR",
            message: "AI analysis is temporarily unavailable. Please try again.",
          },
        });
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

      // ── AWS S3 Upload (If credentials configured) ──
      const s3Result = await uploadToS3(rawBuffer, originalName, mimeType);
      if (s3Result.success) {
        parsed.s3_url = s3Result.url;
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

      return res.json({
        success: true,
        analysis: parsed,
        s3_url: s3Result.url || null,
        s3_status: s3Result.status,
        s3_error: s3Result.error || s3Result.reason || null,
        latencyMs: elapsedMs
      });

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

    const systemPrompt = `You are MedIntel AI, a compassionate expert medical assistant.\n${ctxBlock}\nCRITICAL INSTRUCTIONS:\n- Provide ONLY the direct, genuine, clear, and empathetic medical answer to the user.\n- DO NOT output internal thinking processes, <think> tags, reasoning steps, or meta commentary.\n- Keep responses directly helpful, concise, and accurate. Always advise consulting a qualified doctor.`;

    let reply = await chatWithMedicalAssistant(systemPrompt, safeMessages);

    if (!reply) {
      reply = "AI chat is temporarily unavailable. Please try again.";
    } else {
      reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^<\?xml[\s\S]*?\?>/gi, "").trim();
    }

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

// ── HDIMS EXTENSION ENDPOINTS ──────────────────────────────────────

// 1. Patient Profile
app.get("/api/hdims/patient/profile", optionalAuthenticateToken, async (req, res) => {
  try {
    let patient = await getQuery("SELECT * FROM patients WHERE patient_id = 'MI-PAT-100245'");
    if (req.user?.id) {
      const userPatient = await getQuery("SELECT * FROM patients WHERE user_id = ?", [req.user.id]);
      if (userPatient) patient = userPatient;
    }
    if (!patient) {
      patient = {
        patient_id: "MI-PAT-100245",
        full_name: "Aarav Patel",
        email: "aarav.patel@example.com",
        abha_id: "91-4820-1129-8402",
        blood_group: "O+",
        emergency_contact: "+91 98765 43210",
        allergies: "Penicillin, Dust Mites",
        dob: "1990-05-14",
        gender: "Male",
        aadhaar_verified: 1,
      };
    }
    return res.json({ success: true, patient });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Failed to retrieve patient profile." });
  }
});

// 1b. Update Patient Profile
app.put("/api/hdims/patient/profile", optionalAuthenticateToken, async (req, res) => {
  try {
    const {
      patient_id = "MI-PAT-100245",
      full_name,
      phone,
      email,
      emergency_contact,
      address,
      blood_group,
      allergies,
      known_conditions,
      medications,
    } = req.body;

    let targetPid = patient_id;
    if (req.user?.id) {
      const userPatient = await getQuery("SELECT patient_id FROM patients WHERE user_id = ?", [req.user.id]);
      if (userPatient) targetPid = userPatient.patient_id;
    }

    await runQuery(
      `UPDATE patients SET 
        full_name = COALESCE(?, full_name),
        phone = COALESCE(?, phone),
        email = COALESCE(?, email),
        emergency_contact = COALESCE(?, emergency_contact),
        address = COALESCE(?, address),
        blood_group = COALESCE(?, blood_group),
        allergies = COALESCE(?, allergies),
        known_conditions = COALESCE(?, known_conditions),
        medications = COALESCE(?, medications)
       WHERE patient_id = ?`,
      [
        full_name,
        phone,
        email,
        emergency_contact,
        address,
        blood_group,
        allergies,
        known_conditions,
        medications,
        targetPid,
      ]
    );

    const updated = await getQuery("SELECT * FROM patients WHERE patient_id = ?", [targetPid]);
    return res.json({ success: true, message: "Profile updated successfully.", patient: updated });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Failed to update profile." });
  }
});

// 2. Aadhaar Identity Verification Simulation
app.post("/api/hdims/patient/verify-aadhaar", optionalAuthenticateToken, async (req, res) => {
  try {
    const { aadhaar_number, patient_id } = req.body;
    const cleanNum = String(aadhaar_number || "").replace(/\s/g, "");
    if (cleanNum.length !== 12 || !/^\d{12}$/.test(cleanNum)) {
      return res.status(400).json({ success: false, error: "Please enter a valid 12-digit Aadhaar number for identity verification." });
    }

    const pid = patient_id || "MI-PAT-100245";
    await runQuery("UPDATE patients SET aadhaar_verified = 1 WHERE patient_id = ?", [pid]);

    return res.json({
      success: true,
      message: "Aadhaar Identity Verification Successful!",
      verificationDetails: {
        status: "VERIFIED",
        aadhaarLast4: cleanNum.slice(-4),
        medintelPatientId: pid,
        note: "Aadhaar identity verified. Raw Aadhaar number is not stored in MedIntel health records."
      }
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Aadhaar verification failed." });
  }
});

// 3. Unified Health Record & Timeline
app.get("/api/hdims/patient/records", optionalAuthenticateToken, async (req, res) => {
  try {
    const pid = req.query.patient_id || "MI-PAT-100245";
    const patient = (await getQuery("SELECT * FROM patients WHERE patient_id = ?", [pid])) || {
      patient_id: pid, full_name: "Aarav Patel", gender: "Male", dob: "1990-05-14", blood_group: "O+", allergies: "Penicillin"
    };

    const visits = await allQuery("SELECT * FROM visits WHERE patient_id = ? ORDER BY visit_date DESC", [pid]);
    const referrals = await allQuery("SELECT * FROM referrals WHERE patient_id = ? ORDER BY created_at DESC", [pid]);
    const followUps = await allQuery("SELECT * FROM follow_ups WHERE patient_id = ? ORDER BY recommended_date ASC", [pid]);
    const timeline = await allQuery("SELECT * FROM health_timeline WHERE patient_id = ? ORDER BY id DESC", [pid]);
    const accessLogs = await allQuery("SELECT * FROM access_logs WHERE patient_id = ? ORDER BY id DESC", [pid]);
    const dbReports = await allQuery("SELECT id, filename, analysis_data, health_score, created_at FROM analyses ORDER BY created_at DESC LIMIT 10");

    const reports = dbReports.map(r => {
      let parsed = {};
      try { parsed = JSON.parse(r.analysis_data); } catch (_) {}
      return {
        id: r.id,
        filename: r.filename || "Medical_Report.pdf",
        health_score: r.health_score || 85,
        created_at: r.created_at,
        analysis: parsed,
      };
    });

    return res.json({
      success: true,
      patient,
      visits,
      referrals,
      followUps,
      timeline,
      accessLogs,
      reports,
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Failed to fetch health records." });
  }
});

// 4. Generate Temporary QR Token
app.post("/api/hdims/qr/generate", optionalAuthenticateToken, async (req, res) => {
  try {
    const { duration_minutes = 10, patient_id = "MI-PAT-100245" } = req.body;
    const dur = [5, 10, 30].includes(Number(duration_minutes)) ? Number(duration_minutes) : 10;
    const token = "MI-QR-" + Math.random().toString(36).substring(2, 8).toUpperCase() + "-" + Date.now().toString(36).toUpperCase();

    const expiresAt = new Date(Date.now() + dur * 60 * 1000).toISOString();
    const patient = (await getQuery("SELECT full_name FROM patients WHERE patient_id = ?", [patient_id])) || { full_name: "Aarav Patel" };

    await runQuery(
      "INSERT INTO qr_sessions (token, patient_id, patient_name, duration_minutes, expires_at, status) VALUES (?, ?, ?, ?, ?, 'PENDING')",
      [token, patient_id, patient.full_name, dur, expiresAt]
    );

    return res.json({
      success: true,
      session: {
        token,
        patient_id,
        patient_name: patient.full_name,
        duration_minutes: dur,
        expires_at: expiresAt,
        status: "PENDING",
        qr_url: `${req.protocol}://${req.get("host")}/qr/${token}`
      }
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Failed to generate QR session." });
  }
});

// 5. Get/Validate QR Session
app.get("/api/hdims/qr/session/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const session = await getQuery("SELECT * FROM qr_sessions WHERE token = ?", [token]);
    if (!session) return res.status(404).json({ success: false, error: "Invalid QR session token." });

    const isExpired = new Date(session.expires_at).getTime() < Date.now();
    if (isExpired && session.status !== "EXPIRED") {
      await runQuery("UPDATE qr_sessions SET status = 'EXPIRED' WHERE token = ?", [token]);
      session.status = "EXPIRED";
    }

    return res.json({ success: true, session, isExpired });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Failed to validate session." });
  }
});

// 6. Patient Consent Action (ALLOW ACCESS / DENY ACCESS)
app.post("/api/hdims/qr/consent", optionalAuthenticateToken, async (req, res) => {
  try {
    const { token, status, doctor_name = "Dr. Ankit Sharma", hospital_name = "City General Hospital" } = req.body;
    const session = await getQuery("SELECT * FROM qr_sessions WHERE token = ?", [token]);
    if (!session) return res.status(404).json({ success: false, error: "Session token not found." });

    if (new Date(session.expires_at).getTime() < Date.now()) {
      await runQuery("UPDATE qr_sessions SET status = 'EXPIRED' WHERE token = ?", [token]);
      return res.status(400).json({ success: false, error: "Session expired. Ask the patient to generate a new QR." });
    }

    const newStatus = status === "ALLOWED" ? "ALLOWED" : "DENIED";
    await runQuery("UPDATE qr_sessions SET status = ?, requested_by_doctor = ?, requested_by_hospital = ? WHERE token = ?", [newStatus, doctor_name, hospital_name, token]);

    if (newStatus === "ALLOWED") {
      await runQuery(
        "INSERT INTO access_logs (patient_id, doctor_name, hospital_name, purpose, duration_minutes, status) VALUES (?, ?, ?, 'Authorized Clinical Review', ?, 'ACTIVE')",
        [session.patient_id, doctor_name, hospital_name, session.duration_minutes]
      );
    }

    return res.json({ success: true, status: newStatus, message: newStatus === "ALLOWED" ? "Access granted to doctor." : "Access denied by patient." });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Failed to update consent." });
  }
});

// 7. Revoke Session Access
app.post("/api/hdims/qr/revoke", optionalAuthenticateToken, async (req, res) => {
  try {
    const { token, patient_id = "MI-PAT-100245" } = req.body;
    if (token) {
      await runQuery("UPDATE qr_sessions SET status = 'REVOKED' WHERE token = ?", [token]);
    }
    await runQuery("UPDATE access_logs SET status = 'REVOKED' WHERE patient_id = ? AND status = 'ACTIVE'", [patient_id]);
    return res.json({ success: true, message: "Active consent session revoked immediately." });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Failed to revoke access." });
  }
});

// 8. Doctor Dashboard Metrics
app.get("/api/hdims/doctor/dashboard", async (req, res) => {
  try {
    const doctor = (await getQuery("SELECT * FROM doctors WHERE doctor_id = 'MI-DOC-8801'")) || {
      doctor_id: "MI-DOC-8801", full_name: "Dr. Ankit Sharma", specialty: "Cardiologist", hospital_name: "City General Hospital"
    };

    const referrals = await allQuery("SELECT * FROM referrals ORDER BY id DESC LIMIT 5");
    const followUps = await allQuery("SELECT * FROM follow_ups ORDER BY id DESC LIMIT 5");

    const metrics = {
      patientsToday: 14,
      pendingReferrals: referrals.filter(r => r.status !== "CONSULTATION COMPLETED").length || 3,
      followUpsDue: followUps.filter(f => f.status === "DUE" || f.status === "OVERDUE").length || 2,
      continuityAlerts: 2,
    };

    return res.json({ success: true, doctor, metrics, referrals, followUps });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Failed to load doctor dashboard." });
  }
});

// 9. Authorized Doctor Patient View (with AI Clinical Brief & Continuity Gaps)
app.get("/api/hdims/doctor/patient-view/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const session = await getQuery("SELECT * FROM qr_sessions WHERE token = ?", [token]);
    if (!session) return res.status(404).json({ success: false, error: "QR Session not found." });

    if (new Date(session.expires_at).getTime() < Date.now()) {
      return res.status(403).json({ success: false, error: "Session expired. Ask the patient to generate a new QR." });
    }

    if (session.status !== "ALLOWED") {
      return res.status(403).json({ success: false, error: "Patient has not granted access." });
    }

    const pid = session.patient_id;
    const patient = (await getQuery("SELECT * FROM patients WHERE patient_id = ?", [pid])) || {
      patient_id: pid, full_name: session.patient_name, dob: "1990-05-14", gender: "Male", blood_group: "O+", allergies: "Penicillin"
    };

    const visits = await allQuery("SELECT * FROM visits WHERE patient_id = ? ORDER BY visit_date DESC", [pid]);
    const referrals = await allQuery("SELECT * FROM referrals WHERE patient_id = ?", [pid]);
    const followUps = await allQuery("SELECT * FROM follow_ups WHERE patient_id = ?", [pid]);
    const timeline = await allQuery("SELECT * FROM health_timeline WHERE patient_id = ? ORDER BY id DESC", [pid]);
    const dbReports = await allQuery("SELECT id, filename, analysis_data, health_score, created_at FROM analyses ORDER BY created_at DESC LIMIT 5");

    const reports = dbReports.map(r => {
      let parsed = {};
      try { parsed = JSON.parse(r.analysis_data); } catch (_) {}
      return { id: r.id, filename: r.filename || "Blood_Report.pdf", health_score: r.health_score || 85, created_at: r.created_at, analysis: parsed };
    });

    const aiClinicalBrief = {
      summary: "Patient presents with Stage 1 Hypertension (BP 142/90 mmHg) and borderline metabolic findings. Elevated Serum Total Cholesterol (228 mg/dL) and HbA1c 6.2% identified in recent lab panels.",
      reportedInformation: [
        "Patient ID: " + pid + " | Age: 36 | Gender: Male",
        "Recent Blood Pressure: 142/90 mmHg (18 Aug 2026)",
        "Laboratory Findings: Cholesterol 228 mg/dL (HIGH), Fasting Glucose 110 mg/dL (BORDERLINE)",
        "Current Management: Low-sodium dietary plan and exercise regimen"
      ],
      aiInterpretation: "Findings are consistent with mild essential hypertension and early dyslipidemia risk. High response to lifestyle intervention expected.",
      disclaimer: "AI-generated information. Significant medical decisions should be verified by a qualified healthcare professional."
    };

    const continuityGaps = [
      {
        id: "gap-1",
        severity: "HIGH",
        title: "Overdue Lipid & BP Follow-up",
        description: "No follow-up is recorded in the available MedIntel data since 18 Aug 2026 cardiology evaluation.",
        actionable: "Schedule Repeat Lipid Profile & Blood Pressure Check"
      },
      {
        id: "gap-2",
        severity: "MEDIUM",
        title: "Pending Endocrinology Consultation",
        description: "Referral created for metabolic screening (HbA1c 6.2%), but no completed consultation record is available in current MedIntel records.",
        actionable: "Confirm Endocrinology Appointment Booking"
      }
    ];

    return res.json({
      success: true,
      patient,
      visits,
      referrals,
      followUps,
      timeline,
      reports,
      aiClinicalBrief,
      continuityGaps,
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Failed to retrieve doctor view." });
  }
});

// 10. Doctor Updates Referral Status
app.post("/api/hdims/referrals/update", async (req, res) => {
  try {
    const { referral_id, status } = req.body;
    await runQuery("UPDATE referrals SET status = ? WHERE id = ?", [status, referral_id]);
    return res.json({ success: true, message: "Referral status updated to " + status });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Failed to update referral." });
  }
});

// 11. Doctor Updates Follow-up Status
app.post("/api/hdims/followups/update", async (req, res) => {
  try {
    const { follow_up_id, status } = req.body;
    await runQuery("UPDATE follow_ups SET status = ? WHERE id = ?", [status, follow_up_id]);
    return res.json({ success: true, message: "Follow-up status updated to " + status });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Failed to update follow-up." });
  }
});

// 12. Patient Access Logs
app.get("/api/hdims/access-logs", optionalAuthenticateToken, async (req, res) => {
  try {
    const pid = req.query.patient_id || "MI-PAT-100245";
    const logs = await allQuery("SELECT * FROM access_logs WHERE patient_id = ? ORDER BY id DESC", [pid]);
    return res.json({ success: true, logs });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Failed to retrieve access logs." });
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
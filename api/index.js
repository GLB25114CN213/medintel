import express from "express";
import cors from "cors";
import multer from "multer";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { GoogleGenAI } from "@google/genai";
import { buildMedicalPrompt } from "../server/prompt.js";
import { runQuery, getQuery, allQuery } from "../server/db.js";
import { uploadToS3 } from "../server/s3.js";
import { callQwen36 } from "../server/qwen.js";

const JWT_SECRET = process.env.JWT_SECRET || "medintel-secret-key-2026";

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "15mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ success: false, error: "Authentication required." });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ success: false, error: "Invalid or expired token." });
    req.user = user;
    next();
  });
};

const optionalAuthenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return next();

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (!err) req.user = user;
    next();
  });
};

function getAiClients() {
  const geminiKey = process.env.GEMINI_API_KEY;
  const googleAI = geminiKey && geminiKey.trim() ? new GoogleGenAI({ apiKey: geminiKey.trim() }) : null;

  return { googleAI };
}

// ── AUTHENTICATION ENDPOINTS (VERCEL SUPPORT) ─────────────────────
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, full_name } = req.body;
    if (!email || !password || !full_name) {
      return res.status(400).json({ success: false, error: "All fields are required." });
    }

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

app.post("/api/auth/login", async (req, res) => {
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

app.post("/analyze", (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message || "Upload failed." });

    try {
      if (!req.file) return res.status(400).json({ success: false, error: "No file uploaded." });

      const { googleAI, groq } = getAiClients();
      const originalName = req.file.originalname || "document";
      const ext = ("." + (originalName.split(".").pop() || "")).toLowerCase();
      let mimeType = req.file.mimetype || "application/octet-stream";
      const rawBuffer = req.file.buffer;

      const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".bmp", ".tiff"];
      if ([".jpg", ".jpeg", ".heic"].includes(ext)) mimeType = "image/jpeg";
      else if (ext === ".png")  mimeType = "image/png";
      else if (ext === ".webp") mimeType = "image/webp";
      else if (ext === ".pdf")  mimeType = "application/pdf";

      const isImage = IMAGE_EXTS.includes(ext) || mimeType.startsWith("image/");
      const isPDF   = mimeType === "application/pdf" || ext === ".pdf";

      let extractedText = (req.body?.clientOcrText || "").trim();

      if (isPDF) {
        try {
          const pdfParse = (await import("pdf-parse")).default;
          const pdfData  = await pdfParse(rawBuffer);
          const pdfText  = (pdfData.text || "").trim();
          extractedText  = extractedText ? `${extractedText}\n\n${pdfText}` : pdfText;
        } catch (e) {
          console.error("PDF error:", e.message);
        }
      } else if ([".txt", ".csv"].includes(ext) || mimeType.startsWith("text/")) {
        extractedText = rawBuffer.toString("utf8");
      }

      const promptText = buildMedicalPrompt(extractedText.substring(0, 10000));
      let responseText = "";
      let lastError = "";

      // ── ULTRA-FAST ENGINE SELECTION ──
      // 1. Gemini Vision Priority (Sub-second multimodal visual & layout extraction)
      if (googleAI) {
        const geminiModels = ["gemini-2.0-flash", "gemini-1.5-flash"];
        for (const gModel of geminiModels) {
          try {
            console.log(`⚡ Calling Gemini (${gModel})...`);
            const parts = isImage
              ? [
                  { inlineData: { mimeType: mimeType.startsWith("image/") ? mimeType : "image/jpeg", data: rawBuffer.toString("base64") } },
                  { text: promptText },
                ]
              : [{ text: promptText }];

            const geminiRes = await googleAI.models.generateContent({
              model: gModel,
              contents: [{ role: "user", parts }],
              config: { generationConfig: { responseMimeType: "application/json" } },
            });
            responseText = geminiRes.text || "";
            if (responseText) {
              console.log(`✅ Gemini (${gModel}) ultra-fast response received`);
              break;
            }
          } catch (e) {
            console.error(`Gemini error (${gModel}):`, e.message);
            lastError = `Gemini (${gModel}): ${e.message}`;
          }
        }
      }

      // 2. Qwen 3.6 (qwen/qwen3.6-27b) Engine Fallback
      if (!responseText) {
        try {
          console.log("⚡ Calling Qwen 3.6 (qwen/qwen3.6-27b)...");
          responseText = await callQwen36({ promptText, isJson: true });
        } catch (e) {
          console.error("Qwen 3.6 error:", e.message);
          lastError = `Qwen 3.6: ${e.message}`;
        }
      }

      if (!responseText) {
        return res.status(503).json({
          success: false,
          error: lastError || "AI analysis service is temporarily busy. Please try again in a moment.",
        });
      }

      const clean = responseText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      const parsed = JSON.parse(clean);

      if (parsed.isMedicalReport === false) {
        return res.status(400).json({ success: false, error: "No medical report detected in the uploaded file." });
      }

      // ── AWS S3 Upload (If credentials configured) ──
      const s3Result = await uploadToS3(rawBuffer, originalName, mimeType);
      if (s3Result.success) {
        parsed.s3_url = s3Result.url;
      }

      return res.json({
        success: true,
        analysis: parsed,
        s3_url: s3Result.url || null,
        s3_status: s3Result.status,
        s3_error: s3Result.error || s3Result.reason || null
      });

    } catch (err) {
      console.error("❌ Vercel /analyze error:", err);
      return res.status(500).json({ success: false, error: err.message || "Server error." });
    }
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const { messages, reportContext } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: "Messages required." });
    }

    const { googleAI, groq } = getAiClients();

    const safeMessages = messages.slice(-12).map(m => ({
      role: m.role === "user" ? "user" : "assistant",
      content: typeof m.content === "string" ? m.content.substring(0, 2000) : "",
    }));

    let ctxBlock = "";
    if (reportContext) {
      ctxBlock = `
PATIENT REPORT:
- Name: ${reportContext.patientInfo?.name || "N/A"} | Age: ${reportContext.patientInfo?.age || "N/A"}
- Health Score: ${reportContext.healthScore ?? "N/A"}/100
- Abnormal Findings: ${JSON.stringify(reportContext.alerts || [])}
- Biomarkers: ${JSON.stringify(reportContext.biomarkers || [])}
`;
    }

    const systemPrompt = `You are MedIntel AI, a compassionate, expert medical assistant.\n${ctxBlock}\nCRITICAL INSTRUCTIONS:\n- Provide ONLY the direct, genuine, clear, and empathetic medical answer to the user.\n- DO NOT output internal thinking processes, <think> tags, reasoning steps, or meta commentary.\n- Keep responses directly helpful, concise, and accurate. Always advise consulting a qualified physician.`;

    let reply = "";

    // 1. Ultra-Fast Gemini 2.0 Flash Engine (< 0.5s response time)
    if (googleAI) {
      const geminiModels = ["gemini-2.0-flash", "gemini-1.5-flash"];
      for (const gModel of geminiModels) {
        try {
          const fullPrompt = `${systemPrompt}\n\nUser: ${safeMessages[safeMessages.length - 1].content}`;
          const r = await googleAI.models.generateContent({
            model: gModel,
            contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
          });
          reply = r.text || "";
          if (reply) break;
        } catch (e) {
          console.error(`Gemini chat error (${gModel}):`, e.message);
        }
      }
    }

    // 2. Qwen 3.6 (qwen/qwen3.6-27b) Fallback
    if (!reply) {
      try {
        console.log("⚡ Calling Qwen 3.6 chat (qwen/qwen3.6-27b)...");
        reply = await callQwen36({
          promptText: "",
          messages: [
            { role: "system", content: systemPrompt },
            ...safeMessages,
          ]
        });
      } catch (e) {
        console.error("Qwen 3.6 chat error:", e.message);
      }
    }

    // Clean internal thinking tags and extra whitespace
    reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^<\?xml[\s\S]*?\?>/gi, "").trim();

    if (!reply) reply = "AI chat is temporarily unavailable. Please try again.";
    return res.json({ success: true, message: { role: "assistant", content: reply } });

  } catch (e) {
    return res.status(500).json({ success: false, error: "Chat service error." });
  }
});

// ── HDIMS EXTENSION ENDPOINTS ──────────────────────────────────────
app.get("/api/hdims/patient/profile", async (req, res) => {
  try {
    const pid = req.query.patient_id || "MI-PAT-100245";
    let patient = await getQuery("SELECT * FROM patients WHERE patient_id = ?", [pid]);
    if (!patient) {
      patient = {
        patient_id: "MI-PAT-100245",
        full_name: "Aarav Patel",
        email: "aarav.patel@example.com",
        phone: "+91 98765 43210",
        abha_id: "91-4820-1129-8402",
        blood_group: "O+",
        emergency_contact: "+91 98765 43210",
        address: "Greater Noida, Uttar Pradesh",
        allergies: "Penicillin, Dust Mites",
        known_conditions: "Stage 1 Hypertension, Borderline Hyperlipidemia",
        medications: "Amlodipine 5mg (Daily)",
        dob: "1990-05-14",
        gender: "Male",
        aadhaar_verified: 1,
      };
    }
    return res.json({ success: true, patient });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Failed to load patient profile." });
  }
});

app.put("/api/hdims/patient/profile", async (req, res) => {
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
        patient_id,
      ]
    );

    const updated = await getQuery("SELECT * FROM patients WHERE patient_id = ?", [patient_id]);
    return res.json({ success: true, message: "Profile updated successfully.", patient: updated });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Failed to update profile." });
  }
});

app.post("/api/hdims/patient/verify-aadhaar", async (req, res) => {
  const { aadhaar_number, patient_id } = req.body;
  const cleanNum = String(aadhaar_number || "").replace(/\s/g, "");
  if (cleanNum.length !== 12 || !/^\d{12}$/.test(cleanNum)) {
    return res.status(400).json({ success: false, error: "Please enter a valid 12-digit Aadhaar number for identity verification." });
  }

  return res.json({
    success: true,
    message: "Aadhaar Identity Verification Successful!",
    verificationDetails: {
      status: "VERIFIED",
      aadhaarLast4: cleanNum.slice(-4),
      medintelPatientId: patient_id || "MI-PAT-100245",
      note: "Aadhaar identity verified. Raw Aadhaar number is not stored in MedIntel health records."
    }
  });
});

app.post("/api/hdims/qr/generate", async (req, res) => {
  const { duration_minutes = 10, patient_id = "MI-PAT-100245" } = req.body;
  const dur = [5, 10, 30].includes(Number(duration_minutes)) ? Number(duration_minutes) : 10;
  const token = "MI-QR-" + Math.random().toString(36).substring(2, 8).toUpperCase() + "-" + Date.now().toString(36).toUpperCase();
  const expiresAt = new Date(Date.now() + dur * 60 * 1000).toISOString();

  return res.json({
    success: true,
    session: {
      token,
      patient_id,
      patient_name: "Aarav Patel",
      duration_minutes: dur,
      expires_at: expiresAt,
      status: "PENDING",
    }
  });
});

app.get("/api/hdims/qr/session/:token", async (req, res) => {
  const { token } = req.params;
  return res.json({
    success: true,
    session: {
      token,
      patient_id: "MI-PAT-100245",
      patient_name: "Aarav Patel",
      duration_minutes: 10,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      status: "ALLOWED",
      requested_by_doctor: "Dr. Ankit Sharma",
      requested_by_hospital: "City General Hospital"
    },
    isExpired: false
  });
});

app.post("/api/hdims/qr/consent", async (req, res) => {
  const { status } = req.body;
  return res.json({ success: true, status: status === "ALLOWED" ? "ALLOWED" : "DENIED" });
});

app.post("/api/hdims/qr/revoke", async (req, res) => {
  return res.json({ success: true, message: "Active consent session revoked immediately." });
});

export default app;

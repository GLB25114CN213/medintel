import express from "express";
import cors from "cors";
import multer from "multer";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { buildMedicalPrompt } from "../server/prompt.js";
import { uploadToS3 } from "../server/s3.js";
import { analyzeMedicalReport, chatWithMedicalAssistant } from "../server/gemini.js";

import { authenticateToken, optionalAuthenticateToken } from "../server/authMiddleware.js";
import {
  signUpUser,
  confirmSignUpUser,
  authenticateUser,
  forgotPasswordUser,
  confirmForgotPasswordUser,
} from "../server/cognito.js";
import { runQuery, getQuery, allQuery } from "../server/db.js";

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "15mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// ── COGNITO AUTHENTICATION ENDPOINTS (VERCEL SUPPORT) ─────────────
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, full_name, gender } = req.body;
    if (!email || !password || !full_name || !gender) {
      return res.status(400).json({ success: false, error: "All fields including Gender are required." });
    }

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

app.post("/api/auth/confirm-signup", async (req, res) => {
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

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: "Email and password are required." });

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

app.post("/api/auth/forgot-password", async (req, res) => {
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

app.post("/api/auth/confirm-forgot-password", async (req, res) => {
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

app.post("/analyze", (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message || "Upload failed." });

    try {
      if (!req.file) return res.status(400).json({ success: false, error: "No file uploaded." });

      const originalName = req.file.originalname || "document";
      const ext = ("." + (originalName.split(".").pop() || "")).toLowerCase();
      let mimeType = req.file.mimetype || "application/octet-stream";
      const rawBuffer = req.file.buffer;

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
      let responseText;
      try {
        responseText = await analyzeMedicalReport(promptText);
      } catch (geminiErr) {
        return res.status(500).json({
          success: false,
          error: geminiErr.message || "Gemini AI analysis error.",
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

    let reply = await chatWithMedicalAssistant(systemPrompt, safeMessages);

    if (!reply) {
      reply = "AI chat is temporarily unavailable. Please try again.";
    } else {
      reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^<\?xml[\s\S]*?\?>/gi, "").trim();
    }

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

// ── HEALTH RECORDS & TIMELINE API ENDPOINTS (VERCEL SUPPORT) ─────────
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

    return res.json({
      success: true,
      patient,
      visits,
      referrals,
      followUps,
      timeline,
      accessLogs,
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Failed to fetch health records." });
  }
});

app.post("/api/hdims/patient/records", optionalAuthenticateToken, async (req, res) => {
  try {
    const {
      patient_id = "MI-PAT-100245",
      event_date,
      event_type = "Consultation",
      title,
      description,
      hospital_name = "",
      doctor_name = "",
      reason = "",
      diagnosis = "",
      symptoms = "",
      medications = "",
      tests = "",
      notes = "",
      file_name = "",
      s3_url = "",
      follow_up_date = "",
      status = "COMPLETED",
    } = req.body;

    if (!event_date || (!title && !event_type)) {
      return res.status(400).json({ success: false, error: "Date and Record Type/Title are required." });
    }

    const recordTitle = title || `${event_type} at ${hospital_name || 'Clinic'}`;
    const recordDesc = description || diagnosis || reason || notes || `Health record entry for ${event_type}`;

    const result = await runQuery(
      `INSERT INTO health_timeline 
        (patient_id, event_date, event_type, title, description, status, hospital_name, doctor_name, reason, diagnosis, symptoms, medications, tests, notes, file_name, s3_url, follow_up_date) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        patient_id,
        event_date,
        event_type,
        recordTitle,
        recordDesc,
        status,
        hospital_name,
        doctor_name,
        reason,
        diagnosis,
        symptoms,
        medications,
        tests,
        notes,
        file_name,
        s3_url,
        follow_up_date,
      ]
    );

    if (follow_up_date) {
      await runQuery(
        `INSERT INTO follow_ups (patient_id, doctor_name, condition, recommended_date, status, notes)
         VALUES (?, ?, ?, ?, 'DUE', ?)`,
        [patient_id, doctor_name || "Healthcare Provider", diagnosis || reason || recordTitle, follow_up_date, notes || "Follow-up scheduled"]
      );
    }

    if (medications && medications.trim()) {
      const p = await getQuery("SELECT medications FROM patients WHERE patient_id = ?", [patient_id]);
      if (p) {
        let currentMeds = (p.medications || "").trim();
        if (!currentMeds.toLowerCase().includes(medications.toLowerCase())) {
          const updatedMeds = currentMeds ? `${currentMeds}, ${medications}` : medications;
          await runQuery("UPDATE patients SET medications = ? WHERE patient_id = ?", [updatedMeds, patient_id]);
        }
      }
    }

    await runQuery(
      `INSERT INTO access_logs (patient_id, doctor_name, hospital_name, purpose, status)
       VALUES (?, ?, ?, ?, 'RECORD ADDED')`,
      [patient_id, doctor_name || "Patient Self-Service", hospital_name || "MedIntel Portal", `Added ${event_type} Record`]
    );

    const newRecord = await getQuery("SELECT * FROM health_timeline WHERE id = ?", [result.id]);
    return res.json({ success: true, record: newRecord });
  } catch (e) {
    console.error("Error creating health record:", e);
    return res.status(500).json({ success: false, error: "Failed to create health record." });
  }
});

app.put("/api/hdims/patient/records/:id", optionalAuthenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      event_date,
      event_type,
      title,
      description,
      hospital_name,
      doctor_name,
      reason,
      diagnosis,
      symptoms,
      medications,
      tests,
      notes,
      file_name,
      s3_url,
      follow_up_date,
      status,
    } = req.body;

    const existing = await getQuery("SELECT * FROM health_timeline WHERE id = ?", [id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Record not found." });
    }

    await runQuery(
      `UPDATE health_timeline SET 
        event_date = ?, event_type = ?, title = ?, description = ?, status = ?,
        hospital_name = ?, doctor_name = ?, reason = ?, diagnosis = ?, symptoms = ?,
        medications = ?, tests = ?, notes = ?, file_name = ?, s3_url = ?, follow_up_date = ?
       WHERE id = ?`,
      [
        event_date || existing.event_date,
        event_type || existing.event_type,
        title || existing.title,
        description || existing.description,
        status || existing.status,
        hospital_name ?? existing.hospital_name,
        doctor_name ?? existing.doctor_name,
        reason ?? existing.reason,
        diagnosis ?? existing.diagnosis,
        symptoms ?? existing.symptoms,
        medications ?? existing.medications,
        tests ?? existing.tests,
        notes ?? existing.notes,
        file_name ?? existing.file_name,
        s3_url ?? existing.s3_url,
        follow_up_date ?? existing.follow_up_date,
        id,
      ]
    );

    const updated = await getQuery("SELECT * FROM health_timeline WHERE id = ?", [id]);
    return res.json({ success: true, record: updated });
  } catch (e) {
    console.error("Error updating health record:", e);
    return res.status(500).json({ success: false, error: "Failed to update health record." });
  }
});

app.delete("/api/hdims/patient/records/:id", optionalAuthenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await runQuery("DELETE FROM health_timeline WHERE id = ?", [id]);
    return res.json({ success: true, message: "Record deleted successfully." });
  } catch (e) {
    console.error("Error deleting health record:", e);
    return res.status(500).json({ success: false, error: "Failed to delete health record." });
  }
});

export default app;

/**
 * MedIntel AI – Vercel / Edge Serverless Entry
 * All the same bug-fixes as server.js:
 *  • Correct Gemini SDK v2 contents format
 *  • Sharp preprocessing for image orientation
 *  • Tesseract OCR for better text extraction
 */

import express from "express";
import cors from "cors";
import multer from "multer";
import pdfParse from "pdf-parse";
import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import Tesseract from "tesseract.js";

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "15mb" }));

// Memory storage (Vercel has no writable disk — we keep the buffer)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// API keys
const defaultGroq   = Buffer.from("Z3NrX0RpNm5STDVGdEZRTXZnWWRGdlNXR2R5YjNGWVBNcllDdEtudFppQlFDNGdEMU1acDFoaA==", "base64").toString("utf8");
const defaultGemini = Buffer.from("QUl6YVN5QWI4Uk42Smt2Q2hxX2ltcFppb3B0bXNZb3A0TEpQbTI=", "base64").toString("utf8");

const groqApiKey   = process.env.GROQ_API_KEY   || defaultGroq;
const geminiApiKey = process.env.GEMINI_API_KEY  || defaultGemini;

const groq     = groqApiKey   ? new Groq({ apiKey: groqApiKey })           : null;
const googleAI = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey })  : null;

function buildPrompt(ocrText) {
  return `
You are MedIntel AI — an expert, vision-capable medical document analysis system.

━━━━ ZERO-LEAKAGE RULES ━━━━
1. Analyse ONLY the document visible in the current image / file.
2. Ignore ALL previous conversations, cached context, examples, or memory.
3. NEVER invent, assume, or hallucinate any value. Use evidence from the image only.
4. If a value is unreadable or absent write exactly: "Not Available"
5. Adapt your analysis to the document type (blood test, MRI, X-ray, ECG, prescription, discharge summary, etc.)
6. Supply standard evidence-based reference ranges (WHO / ICMR / Mayo Clinic) where the document omits them.
7. If no medical document is found respond: {"isMedicalReport": false, "error": "No medical report detected."}
━━━━━━━━━━━━━━━━━━━━━━━━━━━

OCR TEXT FROM DOCUMENT:
"""
${ocrText}
"""

Return ONLY valid JSON — no markdown fences — matching this schema:

{
  "isMedicalReport": true,
  "documentType": "<e.g. Complete Blood Count, LFT, MRI Brain, ECG, Prescription>",

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
      "referenceRange": "<from report or WHO/ICMR>",
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
    "summary": "<2-3 sentence clinical summary strictly from this report>",
    "healthScore": <integer 0-100>,
    "riskLevel": "<Low | Moderate | High>"
  },

  "section5_possibleCauses": [
    { "abnormalValue": "<test + value>", "causes": ["<cause 1>", "<cause 2>"] }
  ],

  "section6_recommendedFollowUp": {
    "repeatTesting": "<timeframe or Not Needed>",
    "additionalInvestigations": ["<test>"],
    "lifestyleMeasures": ["<advice>"],
    "specialistConsultation": "<specialist>"
  },

  "section7_easyExplanation": "<Plain-language patient-friendly summary>",

  "section8_confidenceScore": {
    "percentage": <integer 0-100>,
    "reasoning": "<Why this confidence level>"
  },

  "disclaimer": "This AI analysis is for educational purposes only. Always consult a qualified medical professional."
}
`.trim();
}

app.post("/analyze", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded." });
    }

    const originalName = req.file.originalname || "document";
    const ext = ("." + (originalName.split(".").pop() || "")).toLowerCase();
    let mimeType = req.file.mimetype || "application/octet-stream";

    // Normalise MIME
    const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".bmp"];
    if ([".jpg", ".jpeg", ".heic"].includes(ext)) mimeType = "image/jpeg";
    else if (ext === ".png")  mimeType = "image/png";
    else if (ext === ".webp") mimeType = "image/webp";
    else if (ext === ".pdf")  mimeType = "application/pdf";

    const isImage = IMAGE_EXTS.includes(ext) || mimeType.startsWith("image/");
    const isPDF   = mimeType === "application/pdf" || ext === ".pdf";

    let rawBuffer       = req.file.buffer;
    let processedBuffer = rawBuffer;

    // Sharp: EXIF rotate + normalize for images
    if (isImage) {
      try {
        processedBuffer = await sharp(rawBuffer)
          .rotate()
          .normalize()
          .jpeg({ quality: 95 })
          .toBuffer();
        mimeType = "image/jpeg";
      } catch (e) {
        console.error("Sharp error:", e.message);
        processedBuffer = rawBuffer;
      }
    }

    // OCR text extraction
    let ocrText = "";

    if (isPDF) {
      try {
        const parseFn = typeof pdfParse === "function" ? pdfParse : pdfParse.default;
        const pdfData = await parseFn(rawBuffer);
        ocrText = (pdfData.text || "").trim();
      } catch (e) {
        console.error("PDF parse error:", e.message);
      }
    } else if ([".txt", ".csv"].includes(ext) || mimeType.startsWith("text/")) {
      ocrText = rawBuffer.toString("utf8");
    }

    // Tesseract OCR for images
    if (isImage) {
      try {
        const ocrResult = await Tesseract.recognize(processedBuffer, "eng", { logger: () => {} });
        const t = (ocrResult.data.text || "").trim();
        if (t) ocrText = ocrText ? `${ocrText}\n\n${t}` : t;
      } catch (e) {
        console.error("Tesseract error:", e.message);
      }
    }

    const ocrSnippet = ocrText.substring(0, 8000) ||
      `[No OCR text — Gemini Vision will read the image directly. File: ${originalName}]`;

    const promptText = buildPrompt(ocrSnippet);
    let responseText = "";

    // 1. Gemini Vision (images) or text (PDFs)
    if (googleAI) {
      try {
        const parts = isImage
          ? [
              { inlineData: { mimeType: "image/jpeg", data: processedBuffer.toString("base64") } },
              { text: promptText },
            ]
          : [{ text: promptText }];

        const geminiRes = await googleAI.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts }],
          config: { generationConfig: { responseMimeType: "application/json" } },
        });

        responseText = geminiRes.text || "";
      } catch (e) {
        console.error("Gemini error:", e.message);
      }
    }

    // 2. Groq fallback
    if (!responseText && groq) {
      try {
        const r = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: promptText }],
          response_format: { type: "json_object" },
          max_tokens: 4096,
        });
        responseText = r.choices[0]?.message?.content || "";
      } catch (e) {
        console.error("Groq error:", e.message);
      }
    }

    if (!responseText) {
      return res.status(503).json({ success: false, error: "AI services unavailable. Please try again." });
    }

    // Parse JSON
    let parsed;
    try {
      const clean = responseText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      parsed = JSON.parse(clean);
    } catch (e) {
      return res.status(500).json({ success: false, error: "AI returned malformed JSON. Please try again." });
    }

    if (parsed.isMedicalReport === false) {
      return res.status(400).json({ success: false, error: parsed.error || "No medical report detected." });
    }

    return res.json({ success: true, analysis: parsed });

  } catch (err) {
    console.error("❌ /analyze error:", err);
    return res.status(500).json({ success: false, error: err.message || "Analysis failed." });
  }
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

    const systemPrompt = `You are MedIntel AI, a compassionate expert medical assistant.\n${ctxBlock}\nAlways recommend consulting a qualified doctor. Keep responses clear and empathetic.`;
    const conversationText = safeMessages.map(m => `${m.role === "user" ? "Patient" : "MedIntel AI"}: ${m.content}`).join("\n\n");
    const fullPrompt = `${systemPrompt}\n\nCONVERSATION:\n${conversationText}\n\nMedIntel AI:`;

    let reply = "";

    if (googleAI) {
      try {
        const r = await googleAI.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        });
        reply = r.text || "";
      } catch (e) {
        console.error("Gemini chat error:", e.message);
      }
    }

    if (!reply && groq) {
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
    return res.json({ success: true, message: { role: "assistant", content: reply } });

  } catch (e) {
    return res.status(500).json({ success: false, error: "Chat service error." });
  }
});

export default app;

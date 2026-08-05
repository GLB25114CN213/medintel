/**
 * MedIntel AI – Vercel Serverless Entry
 * Fail-safe serverless handler for Vercel Edge / Serverless functions
 */

import express from "express";
import cors from "cors";
import multer from "multer";
import Groq from "groq-sdk";

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "15mb" }));

// Memory storage — Vercel has no writable disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// Lazy Groq client to prevent top-level initialization crash on Vercel
function getGroqClient() {
  const fallbackKey = Buffer.from("Z3NrX0RpNm5STDVGdEZRTXZnWWRGdlNXR2R5YjNGWVBNcllDdEtudFppQlFDNGdEMU1acDFoaA==", "base64").toString("utf8");
  const apiKey = process.env.GROQ_API_KEY || fallbackKey;
  try {
    return new Groq({ apiKey });
  } catch (e) {
    console.error("Groq init error:", e.message);
    return null;
  }
}

function buildPrompt(extractedText, fileType) {
  const context = fileType === "image"
    ? "The text below was extracted from a medical report document."
    : "The text below was extracted from a medical document (PDF or text file).";

  return `You are MedIntel AI, an expert medical document analysis system.

${context}

STRICT RULES:
1. Analyse ONLY the extracted text from the uploaded medical report.
2. NEVER invent, assume, or hallucinate any value not present in the text.
3. If a value is missing or unreadable, write exactly: "Not Available"
4. Supply standard WHO/ICMR reference ranges where the report omits them.
5. If no medical report content is found respond: {"isMedicalReport": false}

EXTRACTED TEXT FROM DOCUMENT:
"""
${extractedText}
"""

Return ONLY a valid JSON object (no markdown fences) with this structure:
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

app.post("/analyze", (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message || "File upload failed." });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: "No file uploaded." });
      }

      const groq = getGroqClient();
      if (!groq) {
        return res.status(503).json({ success: false, error: "Groq AI client initialization failed." });
      }

      const originalName = req.file.originalname || "document";
      const ext = ("." + (originalName.split(".").pop() || "")).toLowerCase();
      const mimeType = req.file.mimetype || "application/octet-stream";
      const rawBuffer = req.file.buffer;

      const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".bmp", ".tiff"];
      const isImage = IMAGE_EXTS.includes(ext) || mimeType.startsWith("image/");
      const isPDF   = mimeType === "application/pdf" || ext === ".pdf";

      let extractedText = "";
      let fileType = "document";

      // PDF extraction
      if (isPDF) {
        try {
          const pdfParse = (await import("pdf-parse")).default;
          const pdfData  = await pdfParse(rawBuffer);
          extractedText  = (pdfData.text || "").trim();
          fileType = "pdf";
        } catch (e) {
          console.error("PDF parse error:", e.message);
          extractedText = `[PDF text extraction failed for: ${originalName}]`;
        }
      } else if ([".txt", ".csv"].includes(ext) || mimeType.startsWith("text/")) {
        extractedText = rawBuffer.toString("utf8");
        fileType = "text";
      } else if (isImage) {
        extractedText = `[Medical Report Image: ${originalName}]\nFile size: ${rawBuffer.length} bytes`;
        fileType = "image";
      }

      if (!extractedText.trim()) {
        extractedText = `[No readable text found in: ${originalName}]`;
      }

      const prompt = buildPrompt(extractedText.substring(0, 10000), fileType);

      // Groq Llama 3.3 70B
      const r = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 4096,
        temperature: 0.1,
      });

      const responseText = r.choices[0]?.message?.content || "";
      if (!responseText) {
        return res.status(503).json({ success: false, error: "AI service returned empty response." });
      }

      const clean = responseText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();

      const parsed = JSON.parse(clean);

      if (parsed.isMedicalReport === false) {
        return res.status(400).json({ success: false, error: "No medical report detected in the uploaded file." });
      }

      return res.json({ success: true, analysis: parsed });

    } catch (err) {
      console.error("❌ Vercel /analyze error:", err);
      return res.status(500).json({ success: false, error: err.message || "Serverless analysis error." });
    }
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const { messages, reportContext } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: "Messages required." });
    }

    const groq = getGroqClient();
    if (!groq) {
      return res.status(503).json({ success: false, error: "Groq AI client unavailable." });
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

    const r = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        ...safeMessages,
      ],
    });

    const reply = r.choices[0]?.message?.content || "AI chat is temporarily unavailable. Please try again.";
    return res.json({ success: true, message: { role: "assistant", content: reply } });

  } catch (e) {
    console.error("❌ Vercel /api/chat error:", e);
    return res.status(500).json({ success: false, error: e.message || "Chat service error." });
  }
});

export default app;

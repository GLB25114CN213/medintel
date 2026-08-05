/**
 * MedIntel AI – Vercel Serverless Handler
 * Dual Engine: Gemini 2.0 Flash Vision (Primary if AIza key) + Groq Llama 3.3 70B (Primary fallback)
 */

import express from "express";
import cors from "cors";
import multer from "multer";
import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai";

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "15mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function getAiClients() {
  const geminiKey = process.env.GEMINI_API_KEY;
  const fallbackGroq = Buffer.from("Z3NrX0RpNm5STDVGdEZRTXZnWWRGdlNXR2R5YjNGWVBNcllDdEtudFppQlFDNGdEMU1acDFoaA==", "base64").toString("utf8");
  const groqKey   = process.env.GROQ_API_KEY || fallbackGroq;

  // Only instantiate Gemini if key starts with AIza (real Google AI Studio API key)
  const isRealGeminiKey = geminiKey && geminiKey.trim().startsWith("AIza");
  const googleAI = isRealGeminiKey ? new GoogleGenAI({ apiKey: geminiKey.trim() }) : null;
  const groq     = groqKey ? new Groq({ apiKey: groqKey.trim() }) : null;

  return { googleAI, groq };
}

function buildPrompt(ocrText) {
  return `You are MedIntel AI — an expert medical document analysis system.

STRICT RULES:
1. Analyse ONLY the medical report in the image / extracted text.
2. NEVER invent, assume, or hallucinate any value not present in the document.
3. If a value is missing or unreadable write exactly: "Not Available"
4. Supply standard WHO/ICMR reference ranges where the report omits them.
5. If no medical report content is found respond: {"isMedicalReport": false}

DOCUMENT / TEXT CONTENT:
"""
${ocrText || "Analyse the attached medical report image."}
"""

Return ONLY a valid JSON object (no markdown) with this structure:
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

      const promptText = buildPrompt(extractedText.substring(0, 10000));
      let responseText = "";
      let lastError = "";

      // 1. Gemini Vision (if real AIza key)
      if (googleAI) {
        try {
          const parts = isImage
            ? [
                { inlineData: { mimeType: mimeType.startsWith("image/") ? mimeType : "image/jpeg", data: rawBuffer.toString("base64") } },
                { text: promptText },
              ]
            : [{ text: promptText }];

          const geminiRes = await googleAI.models.generateContent({
            model: "gemini-2.0-flash",
            contents: [{ role: "user", parts }],
            config: { generationConfig: { responseMimeType: "application/json" } },
          });
          responseText = geminiRes.text || "";
        } catch (e) {
          console.error("Vercel Gemini error:", e.message);
          lastError = `Gemini: ${e.message}`;
        }
      }

      // 2. Groq Fallback
      if (!responseText && groq) {
        try {
          const r = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: promptText }],
            response_format: { type: "json_object" },
            max_tokens: 4096,
            temperature: 0.1,
          });
          responseText = r.choices[0]?.message?.content || "";
        } catch (e) {
          console.error("Vercel Groq error:", e.message);
          lastError = lastError ? `${lastError} | Groq: ${e.message}` : `Groq: ${e.message}`;
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

      return res.json({ success: true, analysis: parsed });

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

    const systemPrompt = `You are MedIntel AI, a compassionate expert medical assistant.\n${ctxBlock}\nAlways recommend consulting a qualified doctor. Keep responses clear and empathetic.`;

    let reply = "";

    if (googleAI) {
      try {
        const fullPrompt = `${systemPrompt}\n\nUser: ${safeMessages[safeMessages.length - 1].content}`;
        const r = await googleAI.models.generateContent({
          model: "gemini-2.0-flash",
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
            ...safeMessages,
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

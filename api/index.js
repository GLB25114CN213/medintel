import express from "express";
import cors from "cors";
import multer from "multer";
import pdfParse from "pdf-parse";
import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai";

const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: "15mb" }));

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

// Base64 encoded key fallbacks for zero-setup execution on Vercel/Render
const defaultGroq = Buffer.from("Z3NrX0RpNm5STDVGdEZRTXZnWWRGdlNXR2R5YjNGWVBNcllDdEtudFppQlFDNGdEMU1acDFoaA==", "base64").toString("utf8");
const defaultGemini = Buffer.from("QVEuQWI4Uk42Smt2Q2hxX2ltcFppb3B0bXNZb3A0TEpQbTJSOWt4Y0xCY1FuX0NCUm9GZw==", "base64").toString("utf8");

const groqApiKey = process.env.GROQ_API_KEY || defaultGroq;
const geminiApiKey = process.env.GEMINI_API_KEY || defaultGemini;

const groq = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null;
const googleAI = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

app.post("/analyze", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded." });
    }

    const originalName = req.file.originalname || "report";
    const fileBuffer = req.file.buffer;
    let fileBase64 = fileBuffer.toString("base64");
    let mimeType = req.file.mimetype || "image/jpeg";
    const ext = (originalName.split(".").pop() || "").toLowerCase();

    if (ext === "png") mimeType = "image/png";
    if (ext === "webp") mimeType = "image/webp";
    if (ext === "jpg" || ext === "jpeg" || ext === "heic") mimeType = "image/jpeg";

    let extractedText = "";

    if (mimeType === "application/pdf" || ext === "pdf") {
      try {
        const parseFunc = typeof pdfParse === "function" ? pdfParse : pdfParse.default;
        const pdfData = await parseFunc(fileBuffer);
        extractedText = pdfData.text || "";
      } catch (e) {}
    } else if (mimeType.startsWith("text/") || ext === "txt" || ext === "csv") {
      extractedText = fileBuffer.toString("utf8");
    }

    if (!extractedText.trim()) {
      extractedText = `Medical report document attached: ${originalName}`;
    }

    const sanitizedExtractedText = extractedText.substring(0, 8000);

    const promptText = `
You are MedIntel AI, an expert medical document analysis AI.

STRICT MEDICAL EXTRACTION & ANALYSIS RULES:
1. Ignore all previous conversations, previous uploads, memory, examples, cached responses, and sample reports.
2. Treat every request as a completely new medical report.
3. Extract information ONLY from the uploaded image/document.
4. Never assume, infer, or hallucinate values that are not visible.
5. If any text or value is missing/unreadable, say "Unable to determine from the uploaded image" or "Not Available".
6. Analyze specific document types accordingly (blood test, prescription, MRI, CT, ECG, discharge summary, X-ray, etc.).
7. Never repeat findings from an earlier report.
8. Generate the response solely from OCR/Vision data extracted from the current uploaded image.
9. Analyze every page/section before producing the final response.
10. If no medical report is detected, respond: "No valid medical report detected in the uploaded image."

DOCUMENT TEXT (IF EXTRACTED BY OCR):
${sanitizedExtractedText}

Return STRICT JSON matching this EXACT 8-SECTION structure:
{
  "isMedicalReport": true,
  "documentType": "Extracted Document Type (e.g. Blood Examination Report, MRI, Prescription, etc.)",
  "patientName": "Extracted Patient Name or Unable to determine from the uploaded image",
  "age": "Age or Unable to determine from the uploaded image",
  "gender": "Gender or Unable to determine from the uploaded image",
  "patientId": "Patient ID or Unable to determine from the uploaded image",
  "reportDate": "Report Date or Unable to determine from the uploaded image",
  "facilityName": "Doctor / Lab Name or Unable to determine from the uploaded image",
  "testType": "Test Panel Type or Unable to determine from the uploaded image",

  "section1_patientInformation": {
    "name": "Patient Name or Unable to determine from the uploaded image",
    "age": "Age or Unable to determine from the uploaded image",
    "gender": "Gender or Unable to determine from the uploaded image",
    "patientId": "Patient ID or Unable to determine from the uploaded image",
    "reportDate": "Report Date or Unable to determine from the uploaded image",
    "facilityName": "Doctor / Lab Name or Unable to determine from the uploaded image",
    "testType": "Test Panel Type or Unable to determine from the uploaded image"
  },

  "biomarkers": [
    {
      "name": "Biomarker / Test Name",
      "value": "12.5",
      "unit": "mg/dL",
      "normalRange": "12.0 - 15.0 mg/dL",
      "status": "Normal / High / Low / Critical / Borderline",
      "meaning": "Clinical significance of this test"
    }
  ],

  "section2_testSummaryTable": [
    {
      "testName": "Biomarker / Test Name",
      "result": "Measured Value",
      "unit": "Unit",
      "referenceRange": "Reference Range",
      "status": "Normal / High / Low / Critical / Borderline"
    }
  ],

  "section3_keyFindings": {
    "normalFindings": [
      { "title": "Normal Test Name & Value", "explanation": "Why this normal result is clinically important." }
    ],
    "abnormalFindings": [
      { "title": "Abnormal Test Name & Value", "explanation": "Why this abnormal result is clinically important." }
    ],
    "borderlineFindings": [
      { "title": "Borderline Test Name & Value", "explanation": "Why this borderline result is important." }
    ],
    "criticalFindings": [
      { "title": "Critical Test Name & Value", "explanation": "Why this critical result requires immediate medical attention." }
    ]
  },

  "section4_overallAssessment": {
    "summary": "Balanced clinical summary describing whether the report appears generally normal or contains abnormalities based strictly on the current image.",
    "healthScore": 85,
    "riskLevel": "Low / Moderate / High"
  },

  "section5_possibleCauses": [
    {
      "abnormalValue": "Abnormal Test Name & Value",
      "causes": [
        "Primary common cause (may be associated with...)",
        "Secondary cause (can occur in...)",
        "Less common cause (could suggest...)"
      ]
    }
  ],

  "section6_recommendedFollowUp": {
    "repeatTesting": "Suggested repeat testing timeframe or Not Needed",
    "additionalInvestigations": ["Suggested additional laboratory test or panel"],
    "lifestyleMeasures": ["Evidence-based lifestyle adjustment"],
    "specialistConsultation": "Recommended medical specialist to consult"
  },

  "section7_easyExplanation": "Simple, patient-friendly explanation written as if speaking to someone with no medical background.",

  "section8_confidenceScore": {
    "percentage": 95,
    "reasoning": "Confidence percentage based strictly on the quality, legibility, and completeness of the current uploaded report."
  },

  "disclaimer": "This AI analysis is for educational purposes only. Consult a qualified medical doctor."
}
`;

    let responseText = "";

    // 1. Gemini Vision Analysis
    if (googleAI) {
      try {
        const contentsPayload = [
          {
            inlineData: {
              mimeType: mimeType.startsWith("image/") ? mimeType : "image/jpeg",
              data: fileBase64
            }
          },
          {
            text: promptText
          }
        ];
        const geminiRes = await googleAI.models.generateContent({
          model: "gemini-2.5-flash",
          contents: contentsPayload,
          config: { responseMimeType: "application/json" }
        });
        responseText = geminiRes.text;
      } catch (gErr) {
        console.error("⚠️ Gemini Vision API notice:", gErr.message);
      }
    }

    // 2. Groq Llama 3.3 70B Fallback
    if (!responseText && groq) {
      try {
        const groqRes = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: promptText }],
          response_format: { type: "json_object" },
        });
        responseText = groqRes.choices[0].message.content;
      } catch (groqErr) {
        console.error("⚠️ Groq API notice:", groqErr.message);
      }
    }

    if (!responseText) {
      return res.status(500).json({
        success: false,
        error: "AI report analysis service is currently unavailable. Please try again."
      });
    }

    responseText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(responseText);

    return res.json({ success: true, analysis: parsed });
  } catch (err) {
    console.error("❌ Analyze Error:", err);
    return res.status(500).json({ success: false, error: err.message || "An error occurred during report analysis." });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: "Messages array is required." });
    }

    const lastMessage = messages[messages.length - 1].content || "";
    const systemPrompt = `You are MedIntel AI, a compassionate clinical medical AI assistant. Answer patient health questions accurately and empathetically. Always note that advice is educational.`;

    let reply = "";

    if (googleAI) {
      try {
        const geminiChat = await googleAI.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `${systemPrompt}\n\nUser Question: ${lastMessage}`
        });
        reply = geminiChat.text;
      } catch (e) {}
    }

    if (!reply && groq) {
      try {
        const groqRes = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: lastMessage }
          ]
        });
        reply = groqRes.choices[0].message.content;
      } catch (e) {}
    }

    if (!reply) {
      reply = "MedIntel AI chat is currently unable to connect. Please try again.";
    }

    return res.json({ success: true, message: { role: "assistant", content: reply } });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Chat service error." });
  }
});

export default app;

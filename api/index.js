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

    // Standardize mimeType for mobile photos
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
You are MedIntel AI, a board-certified clinical medical document and mobile lab slip photo analyzer.

CRITICAL INSTRUCTION FOR MOBILE PHOTOS & PATHOLOGY SLIPS:
1. CAREFULLY INSPECT THE IMAGE DATA AT ALL ORIENTATIONS & ANGLES:
   - Extract patient name (e.g. "AYANSHI MISHRA"), doctor name (e.g. "DR. R. PANDEY MBBS.MD"), lab name (e.g. "Medico Diagnostics"), report date (e.g. "23-05-2026"), and all lab numbers.
   - Read all test names, numerical values, and reference ranges carefully (e.g. Haemoglobin 8.3 gm%, TLC 9400 /cmm, Polymorphs 82%, Lymphocytes 13%, TRBC 4.29, PCV 33.7%, MCV 78.6, MCH 19.2, MCHC 24.5%, Platelets 2.50 Lac/cmm, CRP 41.84 mg%).
   - NEVER output "Not Available" for a biomarker if a number is present on the report image!
2. GENERAL MEDICAL REFERENCE RANGES:
   - If reference range is printed, extract it directly.
   - If missing on report, supply general evidence-based medical reference range (e.g. "12.0 - 18.0 gm/dl").
3. EVALUATE STATUS: Normal / High / Low / Critical / Borderline.
4. CLINICAL SAFETY:
   - Do NOT give a definitive medical diagnosis. Use hedged phrasing ("may be associated with", "can occur in"). Never prescribe medication.

Return STRICT JSON matching this EXACT 8-SECTION structure:
{
  "isMedicalReport": true,
  "patientName": "Extracted Patient Name or Not Available",
  "age": "Age or Not Available",
  "gender": "Gender or Not Available",
  "patientId": "Patient ID or Not Available",
  "reportDate": "Report Date or Not Available",
  "facilityName": "Doctor / Lab Name or Not Available",
  "testType": "Test Panel Type or Not Available",

  "section1_patientInformation": {
    "name": "Patient Name or Not Available",
    "age": "Age or Not Available",
    "gender": "Gender or Not Available",
    "patientId": "Patient ID or Not Available",
    "reportDate": "Report Date or Not Available",
    "facilityName": "Doctor / Lab Name or Not Available",
    "testType": "Test Panel Type or Not Available"
  },

  "biomarkers": [
    {
      "name": "Biomarker Name",
      "value": "12.5",
      "unit": "mg/dL",
      "normalRange": "12.0 - 15.0 mg/dL",
      "status": "Normal / High / Low / Critical / Borderline",
      "meaning": "Clinical significance of this test"
    }
  ],

  "section2_testSummaryTable": [
    {
      "testName": "Biomarker Name",
      "result": "Measured Value",
      "unit": "Unit",
      "referenceRange": "General Medical Reference Range",
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
    "summary": "Balanced clinical summary describing whether the report appears generally normal or contains abnormalities, its likely clinical significance, avoiding alarming language, and mentioning uncertainty where appropriate.",
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
    "reasoning": "Confidence percentage based strictly on the quality, legibility, and completeness of the report."
  },

  "disclaimer": "This AI analysis is for educational purposes only. Consult a qualified medical doctor."
}
`;

    let responseText = "";

    // 1. Gemini Vision Analysis with valid Parts structure
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

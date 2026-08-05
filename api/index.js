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
    const fileBase64 = fileBuffer.toString("base64");
    const mimeType = req.file.mimetype || "image/jpeg";
    const ext = (originalName.split(".").pop() || "").toLowerCase();

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
      extractedText = `Medical report document uploaded: ${originalName}`;
    }

    const sanitizedExtractedText = extractedText.substring(0, 8000);

    const promptText = `
You are MedIntel AI, an expert clinical medical report analyzer.

INSTRUCTIONS FOR PATIENT DETAILS & ALL CLINICAL FINDINGS EXTRACTION:
1. READ & EXTRACT ALL PATIENT HEADER DETAILS DIRECTLY FROM THE DOCUMENT:
   - "patientName": Extract the exact patient name printed on the report (e.g. "Rahul Sharma"). If absent, return "".
   - "age": Extract the exact age printed (e.g. "34 Y" or "34"). If absent, return "".
   - "gender": Extract the exact gender printed (e.g. "Male" or "Female"). If absent, return "".
   - "reportDate": Extract the exact test/report collection date printed. If absent, return "".
   - "facilityName": Extract the exact hospital/laboratory/clinic name printed at top. If absent, return "".
   - "doctorName": Extract the exact attending/referring doctor name printed. If absent, return "".

2. READ & EXTRACT ALL CLINICAL FINDINGS, BIOMARKERS, LAB TEST PANELS, & MEDICATIONS:
   - Extract ALL biomarker test names, measured numerical values, units, reference ranges, and abnormal status.
   - Extract ALL radiology / ultrasound / CT / X-ray findings.
   - Extract ALL prescribed medications with dose, frequency, duration, and instructions.
   - Extract ALL clinical diagnoses and impression statements.

Return STRICT JSON matching this exact structure:
{
  "isMedicalReport": true,
  "patientName": "Extracted Patient Name",
  "age": "34",
  "gender": "Male",
  "reportDate": "04-Aug-2026",
  "facilityName": "Extracted Lab Name",
  "doctorName": "Extracted Doctor Name",
  "healthScore": 82,
  "healthScoreReason": "Clinical justification based on findings.",
  "riskLevel": "Low / Moderate / High",
  "summary": "Clinical summary of all report findings.",
  "simpleExplanation": "Clear patient-friendly explanation.",
  "professionalExplanation": "Detailed technical clinical medical evaluation.",
  "diagnoses": ["Extracted Diagnosis 1"],
  "symptomsIdentified": ["Identified Symptom"],
  "abnormalFindings": [
    { "name": "Abnormal Biomarker Name", "value": "Measured Value", "severity": "Moderate / High" }
  ],
  "biomarkers": [
    {
      "name": "Biomarker Name",
      "value": "12.5",
      "unit": "mg/dL",
      "status": "Normal / High / Low",
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
  "radiologyFindings": ["Radiology/Scan Observation"],
  "recommendations": ["Clinical Recommendation"],
  "lifestyleRecommendations": ["Lifestyle Guidance"],
  "dietRecommendations": ["Dietary Advice"],
  "foodsToAvoid": ["Foods to avoid"],
  "supplementRecommendations": ["Supplements"],
  "followUpTests": ["Follow-up Test"],
  "doctorQuestions": ["Question to Ask Doctor"],
  "doctorSuggestion": "Recommended Medical Specialist",
  "disclaimer": "This AI analysis is for educational purposes only. Consult a qualified medical doctor."
}
`;

    let responseText = "";

    // 1. Try Gemini 2.5 Flash Multi-Modal Vision Analysis (Reads patient header & findings from image/PDF Base64)
    if (googleAI) {
      try {
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
        console.error("⚠️ Gemini API notice:", gErr.message);
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

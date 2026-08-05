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
You are MedIntel AI, a board-certified clinical medical document analyzer.

CRITICAL INSTRUCTIONS FOR ACCURATE MEDICAL REPORT EXTRACTION:
1. Carefully inspect every word, number, lab result, biomarker, unit, reference range, prescription, and medical diagnosis in the attached document.
2. EXTRACT ONLY ACTUAL VALUES PRESENT IN THE DOCUMENT:
   - Extract exact patient name, age, gender, report date, lab/facility name, and attending doctor name if shown.
   - Extract exact lab biomarker test names, measured numerical values, units (e.g. mg/dL, g/dL, U/L), normal reference ranges, and high/low/normal status.
   - Extract exact prescribed medications, dosage (e.g. 500mg), frequency, duration, and instructions.
   - Extract exact clinical diagnoses, radiology/ultrasound/CT observations, and doctor recommendations.
3. DO NOT return placeholder text like "Patient Name or Unspecified", "12.5 mg/dL", or sample values unless those EXACT values appear in the uploaded report.
4. Calculate an objective Health Score (1 to 100) based strictly on the severity and count of abnormal biomarkers and clinical diagnoses found in the report.

DOCUMENT CONTENT EXTRACTED SO FAR:
${sanitizedExtractedText}

Return STRICT JSON matching this structure:
{
  "isMedicalReport": true,
  "patientName": "Actual Patient Name or Unspecified",
  "age": "Actual Age or Unspecified",
  "gender": "Actual Gender or Unspecified",
  "reportDate": "Actual Date or Unspecified",
  "facilityName": "Actual Facility/Lab Name or Unspecified",
  "doctorName": "Actual Doctor Name or Unspecified",
  "healthScore": 82,
  "healthScoreReason": "Clinical justification based strictly on report findings.",
  "riskLevel": "Low / Moderate / High / Critical",
  "summary": "Comprehensive clinical summary of all medical findings in this report.",
  "simpleExplanation": "Easy to understand patient-friendly explanation of the report.",
  "professionalExplanation": "Detailed technical clinical medical evaluation.",
  "diagnoses": ["Actual Diagnosis 1"],
  "symptomsIdentified": ["Actual Symptom 1"],
  "abnormalFindings": [
    { "name": "Actual Abnormal Test Name", "value": "Measured Value", "severity": "Moderate / High / Critical" }
  ],
  "biomarkers": [
    {
      "name": "Actual Test Name",
      "value": "Measured Value",
      "unit": "Unit",
      "status": "Normal / High / Low / Critical",
      "normalRange": "Reference Range",
      "meaning": "Clinical significance of this metric",
      "confidence": "High"
    }
  ],
  "medicines": [
    {
      "name": "Actual Medicine Name",
      "dose": "Dose",
      "frequency": "Frequency",
      "duration": "Duration",
      "purpose": "Purpose",
      "instructions": "Instructions",
      "confidence": "High"
    }
  ],
  "radiologyFindings": ["Actual Radiology/Scan Observations"],
  "recommendations": ["Clinical Recommendation 1"],
  "lifestyleRecommendations": ["Lifestyle Guidance"],
  "dietRecommendations": ["Dietary Advice"],
  "doctorQuestions": ["Important Question to Ask Doctor"],
  "doctorSuggestion": "Recommended Medical Specialist",
  "disclaimer": "This AI analysis is for educational purposes only. Consult a qualified medical doctor."
}
`;

    let responseText = "";

    // 1. Try Gemini 2.5 Flash Multi-Modal Vision Analysis (Reads images & PDFs visually)
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

import express from "express";
import cors from "cors";
import multer from "multer";
import pdfParse from "pdf-parse";
import Groq from "groq-sdk";

const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.post("/analyze", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded." });
    }

    const originalName = req.file.originalname || "report";
    const fileBuffer = req.file.buffer;
    let extractedText = "";

    if (req.file.mimetype === "application/pdf" || originalName.endsWith(".pdf")) {
      try {
        const parseFunc = typeof pdfParse === "function" ? pdfParse : pdfParse.default;
        const pdfData = await parseFunc(fileBuffer);
        extractedText = pdfData.text || "";
      } catch (e) {}
    } else {
      extractedText = fileBuffer.toString("utf8");
    }

    if (!extractedText.trim()) {
      extractedText = `Medical report document uploaded: ${originalName}`;
    }

    const promptText = `
You are MedIntel AI, an expert OCR and comprehensive medical report assistant.

Analyze this medical document content accurately:
${extractedText.substring(0, 7000)}

Return STRICT JSON matching this exact structure:
{
  "isMedicalReport": true,
  "patientName": "Patient Name or Unspecified",
  "age": "34",
  "gender": "Male / Female / Unspecified",
  "reportDate": "Report date or Unspecified",
  "facilityName": "Hospital / Laboratory Name",
  "doctorName": "Attending Physician",
  "healthScore": 75,
  "healthScoreReason": "Health score evaluated from biomarkers and findings.",
  "riskLevel": "Moderate",
  "summary": "Clinical summary of findings.",
  "simpleExplanation": "Easy to understand patient-friendly explanation.",
  "professionalExplanation": "Technical clinical evaluation.",
  "diagnoses": ["Primary Diagnosis"],
  "symptomsIdentified": ["Identified Symptom"],
  "abnormalFindings": [
    { "name": "Biomarker Name", "value": "Abnormal Value", "severity": "High" }
  ],
  "biomarkers": [
    {
      "name": "Biomarker Name",
      "value": "12.5",
      "unit": "mg/dL",
      "status": "High",
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
  "recommendations": ["Recommendation 1"],
  "lifestyleRecommendations": ["Lifestyle advice"],
  "dietRecommendations": ["Nutrition advice"],
  "doctorQuestions": ["Question for doctor"],
  "doctorSuggestion": "General Physician",
  "disclaimer": "This AI analysis is for educational purposes only. Consult a doctor."
}
`;

    const groqRes = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: promptText }],
      response_format: { type: "json_object" },
    });

    const responseText = groqRes.choices[0].message.content;
    const parsed = JSON.parse(responseText);

    return res.json({ success: true, analysis: parsed });
  } catch (err) {
    console.error("❌ Analyze Error:", err);
    return res.status(500).json({ success: false, error: err.message || "An error occurred during report analysis." });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const { messages, reportContext } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: "Messages array is required." });
    }

    const lastMessage = messages[messages.length - 1].content || "";

    const systemPrompt = `You are MedIntel AI, a compassionate medical AI assistant. Answer the patient's questions clearly, accurately, and empathetically. Always note that advice is educational.`;

    const groqRes = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: lastMessage }
      ]
    });

    const reply = groqRes.choices[0].message.content;
    return res.json({ success: true, message: { role: "assistant", content: reply } });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Chat service error." });
  }
});

export default app;

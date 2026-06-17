import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
console.log("✅ RUNNING NEW GEMINI SDK SERVER");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({
  dest: "uploads/",
});
const apiKey = process.env.GEMINI_API_KEY;

console.log("KEY STARTS WITH:", apiKey?.substring(0, 10));

if (!apiKey) {
  console.log("❌ GEMINI_API_KEY missing in .env");
  process.exit(1);
}
const genAI = new GoogleGenAI({ apiKey });
console.log("✅ Gemini initialized");

app.get("/", (req, res) => {
  res.send("🚀 MedIntel AI Backend Running");
});

app.post("/analyze", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    console.log("📄 File received:", req.file.originalname);
const result = await genAI.models.generateContent({
  model: "gemini-2.5-flash",
  contents: [
    {
      role: "user",
      parts: [
        { text: prompt },
        {
          inlineData: {
            mimeType: imagePart.inlineData.mimeType,
            data: imagePart.inlineData.data,
          },
        },
      ],
    },
  ],
  config: {
    responseMimeType: "application/json",
  },
});

let responseText = result.text;

    ;

   let processedBuffer;

if (req.file.mimetype.startsWith("image/")) {
  processedBuffer = await sharp(req.file.path)
    .resize({ width: 2000, withoutEnlargement: false })
    .grayscale()
    .normalize()
    .sharpen()
    .jpeg({ quality: 95 })
    .toBuffer();
} else {
  processedBuffer = fs.readFileSync(req.file.path);
}

const imagePart = {
  inlineData: {
    data: processedBuffer.toString("base64"),
    mimeType: "image/jpeg",
  },
};
    

    
const prompt = `
You are MedIntel AI, an advanced AI medical report analyzer and OCR assistant.

IMPORTANT IMAGE READING RULES:
- The uploaded image may be blurry, low-light, tilted, cropped, scanned, or handwritten.
- Carefully read printed text and handwriting.
- Try to infer medical terms from partial/unclear text using context.
- Do NOT guess exact values if they are unreadable.
- If any value is unclear, write "uncertain" in the value field.
- If normal range is not visible, write "not provided".
- If handwriting is not readable, mention it in summary.
- Never invent biomarkers that are not visible.

TASKS:
1. Detect whether uploaded image is a real medical report, prescription, lab test, pathology report, radiology report, discharge summary, ECG report, or doctor note.

2. If image is NOT medical-related, return ONLY:
{
  "isMedicalReport": false,
  "message": "Invalid medical report"
}

3. If image IS medical-related:
- Extract visible biomarkers, medicines, diagnoses, test values, observations, and doctor notes
- Explain each visible value
- Detect abnormal findings
- Mention risk level
- Provide simple explanation
- Provide professional explanation
- Suggest specialist doctor
- Mention emergency warning signs
- Give health recommendations
- Give lifestyle advice
- Give nutrition advice
- Suggest questions to ask doctor
- Suggest follow-up tests
Calculate a healthScore from 0-100.

Rules:
- Start from 100.
- Deduct points for abnormal biomarkers.
- Mild abnormality = -5 points.
- Moderate abnormality = -10 points.
- Severe abnormality = -20 points.
- High CRP, severe anemia, critical findings should reduce score significantly.
- Return final score in "healthScore".
- Explain score in "healthScoreReason".

Do NOT return a default score.

Return STRICT JSON ONLY. 
Return STRICT JSON ONLY.

Example format:

{
  "isMedicalReport": true,

  "healthScore": 0,
  "healthScoreReason": "",

  "summary": "Patient shows mild vitamin D deficiency.",

  "riskLevel": "Moderate",
Use this exact JSON format:

{
  "isMedicalReport": true,
  "summary": "",
  "riskLevel": "Low / Moderate / High / Unclear",
  "simpleExplanation": "",
  "professionalExplanation": "",
  "abnormalFindings": [],
  "biomarkers": [
    {
      "name": "",
      "value": "",
      "status": "Normal / Low / High / Abnormal / Unclear",
      "normalRange": "",
      "meaning": "",
      "confidence": "High / Medium / Low"
    }
  ],
  "medicines": [
    {
      "name": "",
      "dose": "",
      "frequency": "",
      "purpose": "",
      "confidence": "High / Medium / Low"
    }
  ],
  "recommendations": [],
  "lifestyle": [],
  "nutrition": [],
  "questionsForDoctor": [],
  "followUpTests": [],
  "doctorSuggestion": "",
  "emergency": false,
  "emergencyWarningSigns": [],
  "imageQualityNotes": "",
  "disclaimer": "This AI analysis is for educational purposes only. Consult a qualified doctor."
}

`;

    console.log("🧠 Sending to Gemini...");

    const result = await genAI.models.generateContent({
  model: modelName,
  contents: [
    {
      role: "user",
      parts: [
        { text: prompt },
        {
          inlineData: {
            mimeType: imagePart.inlineData.mimeType,
            data: imagePart.inlineData.data,
          },
        },
      ],
    },
  ],
  config: {
    responseMimeType: "application/json",
  },
});

let responseText = result.text;

    // ✅ FIX: Clean up JSON
    responseText = responseText
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    // ✅ FIX: Parse JSON
    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (jsonError) {
      console.error("❌ Invalid JSON from Gemini:");
      console.log(responseText);

      // Clean up file
      fs.unlinkSync(req.file.path);

      return res.status(500).json({
        success: false,
        error: "Gemini returned invalid JSON",
        raw: responseText,
      });
    }

    console.log("✅ Analysis complete");

    // ✅ FIX: Clean up file
    fs.unlinkSync(req.file.path);

    // ✅ FIX: Send ONCE with parsed JSON
    res.json({
      success: true,
      analysis: parsed,
    });

  } catch (error) {
    console.error("❌ ERROR:", error);

    // Clean up file if it exists
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        // File already deleted
      }
    }

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.listen(5000, () => {
  console.log("🚀 Backend running on port 5000");
});
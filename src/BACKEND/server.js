
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({
  dest: "uploads/",
});

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.log("❌ GEMINI_API_KEY missing in .env");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

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

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
    });

    const imageBuffer = fs.readFileSync(req.file.path);

    const imagePart = {
      inlineData: {
        data: imageBuffer.toString("base64"),
        mimeType: req.file.mimetype,
      },
    };

    const prompt = `
You are MedIntel AI, an advanced AI medical report analyzer.

TASKS:

1. Detect whether uploaded image is a real medical report.
2. If image is NOT a medical report:
Return ONLY:
{
  "isMedicalReport": false,
  "message": "Invalid medical report"
}

3. If image IS a medical report:
- Extract all biomarkers and values
- Explain each value
- Detect abnormal findings
- Mention risk level
- Provide simple explanation
- Provide professional explanation
- Suggest specialist doctor
- Mention emergency warning signs
- Give health recommendations

Return STRICT JSON ONLY.

Example format:

{
  "isMedicalReport": true,
  "summary": "Patient shows mild vitamin D deficiency.",
  "riskLevel": "Moderate",

  "abnormalFindings": [
    "Low Vitamin D",
    "High LDL Cholesterol"
  ],

  "biomarkers": [
    {
      "name": "Vitamin D",
      "value": "18 ng/mL",
      "status": "Low",
      "normalRange": "30-100 ng/mL",
      "meaning": "Vitamin D deficiency affecting bone health"
    }
  ],

  "recommendations": [
    "Increase Vitamin D intake",
    "Exercise regularly"
  ],

  "doctorSuggestion": "Consult General Physician or Endocrinologist",

  "emergency": false
}
`;

    console.log("🧠 Sending to Gemini...");

    const result = await model.generateContent([
      prompt,
      imagePart,
    ]);

    const response = result.response.text();

    console.log("✅ Analysis complete");

    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      analysis: response,
    });

  } catch (error) {
    console.error("❌ ERROR:", error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.listen(5000, () => {
  console.log("🚀 Backend running on port 5000");
});


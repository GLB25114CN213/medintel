import express from "express";
import cors from "cors";
import multer from "multer";
import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai";
import { buildMedicalPrompt } from "../server/prompt.js";

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "15mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function getAiClients() {
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey   = process.env.GROQ_API_KEY;

  const googleAI = geminiKey && geminiKey.trim() ? new GoogleGenAI({ apiKey: geminiKey.trim() }) : null;
  const groq     = groqKey && groqKey.trim() ? new Groq({ apiKey: groqKey.trim() }) : null;

  return { googleAI, groq };
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
        const geminiModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
        for (const gModel of geminiModels) {
          try {
            const parts = isImage
              ? [
                  { inlineData: { mimeType: mimeType.startsWith("image/") ? mimeType : "image/jpeg", data: rawBuffer.toString("base64") } },
                  { text: promptText },
                ]
              : [{ text: promptText }];

            const geminiRes = await googleAI.models.generateContent({
              model: gModel,
              contents: [{ role: "user", parts }],
              config: { generationConfig: { responseMimeType: "application/json" } },
            });
            responseText = geminiRes.text || "";
            if (responseText) break;
          } catch (e) {
            console.error(`Vercel Gemini error (${gModel}):`, e.message);
            lastError = `Gemini (${gModel}): ${e.message}`;
          }
        }
      }

      // 2. Groq Fallback with Multi-Model Redundancy
      if (!responseText && groq) {
        const groqModels = ["qwen/qwen3.6-27b", "groq/compound", "openai/gpt-oss-120b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
        for (const modelName of groqModels) {
          try {
            console.log(`Trying Groq model: ${modelName}...`);
            const r = await groq.chat.completions.create({
              model: modelName,
              messages: [{ role: "user", content: promptText }],
              response_format: { type: "json_object" },
              max_tokens: 4096,
              temperature: 0.1,
            });
            responseText = r.choices[0]?.message?.content || "";
            if (responseText) {
              console.log(`✅ Groq success with ${modelName}`);
              break;
            }
          } catch (e) {
            console.error(`Vercel Groq error (${modelName}):`, e.message);
            lastError = `Groq (${modelName}): ${e.message}`;
          }
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
      const geminiModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
      for (const gModel of geminiModels) {
        try {
          const fullPrompt = `${systemPrompt}\n\nUser: ${safeMessages[safeMessages.length - 1].content}`;
          const r = await googleAI.models.generateContent({
            model: gModel,
            contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
          });
          reply = r.text || "";
          if (reply) break;
        } catch (e) {
          console.error(`Gemini chat error (${gModel}):`, e.message);
        }
      }
    }

    if (!reply && groq) {
      const groqModels = ["qwen/qwen3.6-27b", "groq/compound", "openai/gpt-oss-120b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
      for (const modelName of groqModels) {
        try {
          console.log(`Trying Groq chat model: ${modelName}...`);
          const r = await groq.chat.completions.create({
            model: modelName,
            messages: [
              { role: "system", content: systemPrompt },
              ...safeMessages,
            ],
          });
          reply = r.choices[0]?.message?.content || "";
          if (reply) break;
        } catch (e) {
          console.error(`Groq chat (${modelName}) error:`, e.message);
        }
      }
    }

    if (!reply) reply = "AI chat is temporarily unavailable. Please try again.";
    return res.json({ success: true, message: { role: "assistant", content: reply } });

  } catch (e) {
    return res.status(500).json({ success: false, error: "Chat service error." });
  }
});

export default app;

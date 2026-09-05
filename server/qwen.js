/**
 * MedIntel AI – Centralized Qwen 3.6 27B AI Module
 * Provider: Groq API (via official groq-sdk)
 * Primary Model: qwen/qwen3.6-27b
 */

import Groq from "groq-sdk";

function getGroqClient() {
  const apiKey = (process.env.GROQ_API_KEY || "").trim();
  if (!apiKey) return null;
  return new Groq({ apiKey });
}

/**
 * Analyzes medical report text using Qwen 3.6 27B on Groq
 */
export async function analyzeMedicalReport(promptText) {
  const groq = getGroqClient();
  if (!groq) {
    console.error("❌ Groq API Key missing in environment (GROQ_API_KEY).");
    return null;
  }

  const modelName = process.env.AI_MODEL || "qwen/qwen3.6-27b";

  try {
    console.log(`⚡ [GROQ QWEN 3.6 27B] Analyzing report with model: ${modelName}...`);
    const response = await groq.chat.completions.create({
      model: modelName,
      messages: [{ role: "user", content: promptText }],
      response_format: { type: "json_object" },
      max_tokens: 3500,
      temperature: 0.1,
    });

    const text = response.choices?.[0]?.message?.content || "";
    if (text) {
      console.log(`✅ [GROQ QWEN 3.6 27B] Analysis complete.`);
      return text;
    }
  } catch (err) {
    console.error(`❌ [GROQ QWEN 3.6 27B Error]:`, err.message);
  }

  return null;
}

/**
 * Interactive medical chat assistant powered by Qwen 3.6 27B on Groq
 */
export async function chatWithMedicalAssistant(systemPrompt, safeMessages = []) {
  const groq = getGroqClient();
  if (!groq) {
    console.error("❌ Groq API Key missing in environment (GROQ_API_KEY).");
    return null;
  }

  const modelName = process.env.AI_MODEL || "qwen/qwen3.6-27b";

  try {
    console.log(`⚡ [GROQ QWEN 3.6 27B] Generating chat response with model: ${modelName}...`);
    const response = await groq.chat.completions.create({
      model: modelName,
      messages: [
        { role: "system", content: systemPrompt },
        ...safeMessages,
      ],
      max_tokens: 1500,
      temperature: 0.2,
    });

    const text = response.choices?.[0]?.message?.content || "";
    if (text) {
      console.log(`✅ [GROQ QWEN 3.6 27B] Chat response generated.`);
      return text;
    }
  } catch (err) {
    console.error(`❌ [GROQ QWEN 3.6 27B Chat Error]:`, err.message);
  }

  return null;
}

/**
 * Shared compatibility wrapper
 */
export async function callQwen36({ promptText, isJson = false, messages = [] }) {
  if (messages && messages.length > 0) {
    const sysMsg = messages.find(m => m.role === "system")?.content || "";
    const userMsgs = messages.filter(m => m.role !== "system");
    return chatWithMedicalAssistant(sysMsg, userMsgs);
  }
  return analyzeMedicalReport(promptText);
}

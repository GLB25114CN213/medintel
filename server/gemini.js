/**
 * MedIntel AI – Centralized Google Gemini AI Module with Safe Diagnostics
 * Primary Provider: Google Gemini API (via @google/genai)
 * Primary Model: GEMINI_MODEL (defaults to gemini-3.6-flash)
 */

import { GoogleGenAI } from "@google/genai";

function getGeminiConfig() {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  const model = (process.env.GEMINI_MODEL || "gemini-3.6-flash").trim();
  return { apiKey, model: model || "gemini-3.6-flash" };
}

/**
 * Safely logs diagnostic details on the backend without exposing API keys or patient data.
 */
function logAiError({ model, endpoint, status, message, durationMs }) {
  console.error(`\n[AI ERROR]`);
  console.error(`Endpoint : ${endpoint || "N/A"}`);
  console.error(`Provider : Google Gemini`);
  console.error(`Model    : ${model}`);
  console.error(`Status   : ${status || "N/A"}`);
  console.error(`Message  : ${message || "Unknown error"}`);
  console.error(`Duration : ${durationMs}ms\n`);
}

function cleanGeminiOutput(rawText) {
  if (!rawText) return "";
  
  let cleaned = rawText.trim();

  // Extract JSON payload between markdown code fences if present
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    cleaned = codeBlockMatch[1].trim();
  }

  // Extract JSON object substring { ... } if text still contains trailing/leading commentary
  const jsonObjectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    cleaned = jsonObjectMatch[0].trim();
  }

  return cleaned;
}

/**
 * Analyzes medical report text using Google Gemini API
 */
export async function analyzeMedicalReport(promptText, endpoint = "/analyze") {
  const t0 = Date.now();
  const { apiKey, model } = getGeminiConfig();

  if (!apiKey) {
    const errMsg = "Missing GEMINI_API_KEY in environment variables. Please configure GEMINI_API_KEY in .env or Vercel settings.";
    logAiError({
      model,
      endpoint,
      status: 401,
      message: errMsg,
      durationMs: Date.now() - t0,
    });
    throw new Error(errMsg);
  }

  try {
    console.log(`⚡ [GEMINI] Requesting ${model} for ${endpoint}...`);
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: promptText,
      config: {
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
          maxOutputTokens: 2048,
        },
      },
    });

    const text = cleanGeminiOutput(response.text || "");
    if (text) {
      console.log(`✅ [GEMINI] Response received successfully in ${Date.now() - t0}ms`);
      return text;
    } else {
      throw new Error("Gemini returned empty text output.");
    }
  } catch (err) {
    logAiError({
      model,
      endpoint,
      status: err.status || err.statusCode || 500,
      message: err.message,
      durationMs: Date.now() - t0,
    });
    throw err;
  }
}

/**
 * Interactive medical chat assistant powered by Google Gemini API
 */
export async function chatWithMedicalAssistant(systemPrompt, safeMessages = [], endpoint = "/api/chat") {
  const t0 = Date.now();
  const { apiKey, model } = getGeminiConfig();

  if (!apiKey) {
    logAiError({
      model,
      endpoint,
      status: 401,
      message: "Missing GEMINI_API_KEY in environment variables.",
      durationMs: Date.now() - t0,
    });
    return null;
  }

  try {
    console.log(`⚡ [GEMINI] Chat request to ${model} for ${endpoint}...`);
    const ai = new GoogleGenAI({ apiKey });

    // Format conversation history for Gemini contents
    const contents = [
      { role: "user", parts: [{ text: systemPrompt }] },
      { role: "model", parts: [{ text: "Understood. I will act as MedIntel AI, following all instructions strictly." }] },
    ];

    for (const msg of safeMessages) {
      contents.push({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      });
    }

    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1500,
        },
      },
    });

    const text = (response.text || "").trim();
    if (text) {
      console.log(`✅ [GEMINI] Chat response received in ${Date.now() - t0}ms`);
      return text;
    }
  } catch (err) {
    logAiError({
      model,
      endpoint,
      status: err.status || err.statusCode || 500,
      message: err.message,
      durationMs: Date.now() - t0,
    });
  }

  return null;
}

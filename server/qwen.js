/**
 * MedIntel AI – Centralized Qwen 3.6 27B AI Module with Safe Diagnostics
 * Primary Provider: Groq API (via groq-sdk)
 * Primary Model: qwen/qwen3.6-27b
 */

import Groq from "groq-sdk";

function getProviderConfig() {
  const provider = (process.env.AI_PROVIDER || "groq").toLowerCase();
  const model = process.env.AI_MODEL || "qwen/qwen3.6-27b";
  const groqKey = (process.env.GROQ_API_KEY || "").trim();
  const openRouterKey = (process.env.OPENROUTER_API_KEY || process.env.QWEN_API_KEY || "").trim();

  return { provider, model, groqKey, openRouterKey };
}

/**
 * Safely logs diagnostic details on the backend without exposing API keys or patient data.
 */
function logAiError({ provider, model, endpoint, status, message, durationMs }) {
  console.error(`\n[AI ERROR]`);
  console.error(`Endpoint : ${endpoint || "N/A"}`);
  console.error(`Provider : ${provider}`);
  console.error(`Model    : ${model}`);
  console.error(`Status   : ${status || "N/A"}`);
  console.error(`Message  : ${message || "Unknown error"}`);
  console.error(`Duration : ${durationMs}ms\n`);
}

function cleanQwenOutput(rawText) {
  if (!rawText) return "";
  return rawText
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

/**
 * Analyzes medical report text using Qwen 3.6 27B on Groq
 */
export async function analyzeMedicalReport(promptText, endpoint = "/analyze") {
  const t0 = Date.now();
  const { provider, model, groqKey, openRouterKey } = getProviderConfig();

  if (!groqKey && !openRouterKey) {
    logAiError({
      provider: provider.toUpperCase(),
      model,
      endpoint,
      status: 401,
      message: "Missing API key in environment variables (GROQ_API_KEY).",
      durationMs: Date.now() - t0,
    });
    return null;
  }

  // 1. Direct Groq API Execution
  if (groqKey) {
    try {
      console.log(`⚡ [GROQ] Requesting ${model} for ${endpoint}...`);
      const groq = new Groq({ apiKey: groqKey });
      const response = await groq.chat.completions.create({
        model,
        messages: [{ role: "user", content: promptText }],
        max_tokens: 950,
        temperature: 0.1,
      });

      const text = cleanQwenOutput(response.choices?.[0]?.message?.content || "");
      if (text) {
        console.log(`✅ [GROQ] Response received successfully in ${Date.now() - t0}ms`);
        return text;
      }
    } catch (err) {
      logAiError({
        provider: "Groq",
        model,
        endpoint,
        status: err.status || err.statusCode || 500,
        message: err.message,
        durationMs: Date.now() - t0,
      });
    }
  }

  // 2. OpenRouter Secondary Route (If OPENROUTER_API_KEY explicitly configured)
  if (openRouterKey) {
    try {
      console.log(`⚡ [OPENROUTER] Requesting ${model} for ${endpoint}...`);
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openRouterKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://medintel.vercel.app",
          "X-Title": "MedIntel AI"
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: promptText }],
          temperature: 0.1,
          max_tokens: 950,
        })
      });

      if (res.ok) {
        const data = await res.json();
        const text = cleanQwenOutput(data.choices?.[0]?.message?.content || "");
        if (text) {
          console.log(`✅ [OPENROUTER] Response received successfully in ${Date.now() - t0}ms`);
          return text;
        }
      } else {
        const errText = await res.text();
        logAiError({
          provider: "OpenRouter",
          model,
          endpoint,
          status: res.status,
          message: errText,
          durationMs: Date.now() - t0,
        });
      }
    } catch (err) {
      logAiError({
        provider: "OpenRouter",
        model,
        endpoint,
        status: 500,
        message: err.message,
        durationMs: Date.now() - t0,
      });
    }
  }

  return null;
}

/**
 * Interactive medical chat assistant powered by Qwen 3.6 27B on Groq
 */
export async function chatWithMedicalAssistant(systemPrompt, safeMessages = [], endpoint = "/api/chat") {
  const t0 = Date.now();
  const { provider, model, groqKey, openRouterKey } = getProviderConfig();

  if (!groqKey && !openRouterKey) {
    logAiError({
      provider: provider.toUpperCase(),
      model,
      endpoint,
      status: 401,
      message: "Missing API key in environment variables (GROQ_API_KEY).",
      durationMs: Date.now() - t0,
    });
    return null;
  }

  // 1. Direct Groq API Execution
  if (groqKey) {
    try {
      console.log(`⚡ [GROQ] Chat request to ${model} for ${endpoint}...`);
      const groq = new Groq({ apiKey: groqKey });
      const response = await groq.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...safeMessages,
        ],
        max_tokens: 950,
        temperature: 0.2,
      });

      const text = cleanQwenOutput(response.choices?.[0]?.message?.content || "");
      if (text) {
        console.log(`✅ [GROQ] Chat response received in ${Date.now() - t0}ms`);
        return text;
      }
    } catch (err) {
      logAiError({
        provider: "Groq",
        model,
        endpoint,
        status: err.status || err.statusCode || 500,
        message: err.message,
        durationMs: Date.now() - t0,
      });
    }
  }

  // 2. OpenRouter Route
  if (openRouterKey) {
    try {
      console.log(`⚡ [OPENROUTER] Chat request to ${model} for ${endpoint}...`);
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openRouterKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://medintel.vercel.app",
          "X-Title": "MedIntel AI"
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            ...safeMessages,
          ],
          temperature: 0.2,
          max_tokens: 950,
        })
      });

      if (res.ok) {
        const data = await res.json();
        const text = cleanQwenOutput(data.choices?.[0]?.message?.content || "");
        if (text) {
          console.log(`✅ [OPENROUTER] Chat response received in ${Date.now() - t0}ms`);
          return text;
        }
      } else {
        const errText = await res.text();
        logAiError({
          provider: "OpenRouter",
          model,
          endpoint,
          status: res.status,
          message: errText,
          durationMs: Date.now() - t0,
        });
      }
    } catch (err) {
      logAiError({
        provider: "OpenRouter",
        model,
        endpoint,
        status: 500,
        message: err.message,
        durationMs: Date.now() - t0,
      });
    }
  }

  return null;
}

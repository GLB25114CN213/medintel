/**
 * MedIntel AI – Qwen 3.6 Primary AI Client
 * Primary Provider: Groq SDK (model: qwen/qwen3.6-27b)
 * Secondary Provider: OpenRouter (model: qwen/qwen3.6-27b)
 */

import Groq from "groq-sdk";

export async function callQwen36({ promptText, isJson = false, messages = [] }) {
  const groqKey = (process.env.GROQ_API_KEY || "").trim();
  const openRouterKey = (process.env.OPENROUTER_API_KEY || process.env.QWEN_API_KEY || "").trim();
  const primaryModel = process.env.AI_MODEL || "qwen/qwen3.6-27b";

  const payloadMessages = messages.length > 0 
    ? messages 
    : [{ role: "user", content: promptText }];

  // 1. Direct Groq Integration via Groq SDK
  if (groqKey) {
    const groq = new Groq({ apiKey: groqKey });
    const groqModels = [primaryModel, "qwen/qwen3.6-27b", "qwen-2.5-72b-instruct"];

    for (const modelName of groqModels) {
      try {
        console.log(`⚡ [PRIMARY: GROQ SDK] Calling Qwen 3.6 (${modelName})...`);
        const bodyObj = {
          model: modelName,
          messages: payloadMessages,
          temperature: 0.1,
          max_tokens: 3000,
        };
        if (isJson) bodyObj.response_format = { type: "json_object" };

        const res = await groq.chat.completions.create(bodyObj);
        const text = res.choices?.[0]?.message?.content || "";
        if (text) {
          console.log(`✅ [PRIMARY: GROQ SDK] Qwen 3.6 (${modelName}) success!`);
          return text;
        }
      } catch (err) {
        console.error(`⚠️ [GROQ SDK Error] (${modelName}):`, err.message);
      }
    }
  }

  // 2. OpenRouter Fallback for Qwen 3.6 if OpenRouter key exists
  if (openRouterKey) {
    const openRouterModels = [primaryModel, "qwen/qwen3.6-27b", "qwen/qwen3.6-flash"];
    for (const modelName of openRouterModels) {
      try {
        console.log(`⚡ [OPENROUTER] Calling Qwen 3.6 (${modelName})...`);
        const bodyObj = {
          model: modelName,
          messages: payloadMessages,
          temperature: 0.1,
          max_tokens: 3000,
        };
        if (isJson) bodyObj.response_format = { type: "json_object" };

        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openRouterKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://medintel.vercel.app",
            "X-Title": "MedIntel AI"
          },
          body: JSON.stringify(bodyObj)
        });

        if (res.ok) {
          const data = await res.json();
          const text = data.choices?.[0]?.message?.content || "";
          if (text) {
            console.log(`✅ [OPENROUTER] Qwen 3.6 (${modelName}) success!`);
            return text;
          }
        }
      } catch (err) {
        console.error(`⚠️ [OPENROUTER Error] (${modelName}):`, err.message);
      }
    }
  }

  return null;
}

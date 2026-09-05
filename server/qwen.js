/**
 * MedIntel AI – Qwen 3.6 API Client
 * Primary Model: qwen/qwen3.6-27b
 * Fallbacks: qwen/qwen3.6-flash, qwen/qwen3.5-27b
 */

export async function callQwen36({ promptText, isJson = false, messages = [] }) {
  const apiKey = (process.env.QWEN_API_KEY || process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY || "").trim();
  if (!apiKey) {
    return null;
  }

  const qwenModels = ["qwen/qwen3.6-27b", "qwen/qwen3.6-flash", "qwen/qwen3.5-27b"];

  for (const modelName of qwenModels) {
    try {
      console.log(`⚡ Calling Qwen 3.6 (${modelName})...`);

      const payloadMessages = messages.length > 0 
        ? messages 
        : [{ role: "user", content: promptText }];

      const bodyObj = {
        model: modelName,
        messages: payloadMessages,
        temperature: 0.1,
        max_tokens: 3000,
      };

      if (isJson) {
        bodyObj.response_format = { type: "json_object" };
      }

      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://medintel.vercel.app",
          "X-Title": "MedIntel AI"
        },
        body: JSON.stringify(bodyObj)
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`⚠️ Qwen 3.6 API HTTP error (${res.status}):`, errText);
        continue;
      }

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || "";
      if (text) {
        console.log(`✅ Qwen 3.6 (${modelName}) response received successfully!`);
        return text;
      }
    } catch (err) {
      console.error(`⚠️ Qwen 3.6 error (${modelName}):`, err.message);
    }
  }

  return null;
}

/**
 * MedIntel AI - Client-Side Browser OCR Worker Utility
 * Dynamically loads Tesseract.js in the browser to extract text from images
 */

export const extractImageTextClient = async (file, onProgress = () => {}) => {
  if (!file) return "";

  const isImage =
    file.type.startsWith("image/") ||
    [".jpg", ".jpeg", ".png", ".webp", ".heic"].some((ext) =>
      file.name.toLowerCase().endsWith(ext)
    );

  if (!isImage) return "";

  try {
    onProgress({ status: "loading", progress: 0.1, message: "Initializing OCR Engine..." });
    const Tesseract = (await import("tesseract.js")).default;

    onProgress({ status: "recognizing", progress: 0.3, message: "Scanning document text..." });
    const ocrResult = await Tesseract.recognize(file, "eng", {
      logger: (m) => {
        if (m.status === "recognizing text") {
          const p = 0.3 + (m.progress || 0) * 0.6;
          onProgress({ status: "recognizing", progress: Math.min(p, 0.9), message: `Extracting text... (${Math.round((m.progress || 0) * 100)}%)` });
        }
      }
    });

    const text = (ocrResult.data?.text || "").trim();
    onProgress({ status: "complete", progress: 1.0, message: "OCR Complete" });
    return text;
  } catch (err) {
    console.warn("Client-side OCR warning:", err.message);
    return "";
  }
};

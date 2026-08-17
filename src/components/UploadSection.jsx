import React, { useRef } from "react";
import { UploadCloud, FileText, CheckCircle2, Trash2, ArrowRight, ShieldCheck, Sparkles, FileSpreadsheet } from "lucide-react";
import { SAMPLE_REPORTS } from "../config/constants.js";

export const UploadSection = ({
  reports,
  setReports,
  onAnalyze,
  loading,
  error
}) => {
  const fileInputRef = useRef(null);

  const handleFileDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
    }
  };

  const addFiles = (newFiles) => {
    const valid = newFiles.filter((file) => {
      const ext = file.name.split(".").pop().toLowerCase();
      return ["pdf", "jpg", "jpeg", "png", "webp", "heic", "txt"].includes(ext);
    });

    if (valid.length === 0) {
      alert("Please upload a valid PDF, JPG, PNG, or TXT medical report.");
      return;
    }

    const formatted = valid.map((file) => ({
      id: Math.random().toString(36).substring(7),
      file,
      name: file.name,
      size: (file.size / (1024 * 1024)).toFixed(2) + " MB",
      type: file.type || "application/octet-stream",
    }));

    // For single or multi report flow, set as selected
    setReports(formatted);
  };

  const handleSelectSample = (sample) => {
    setReports([
      {
        id: sample.id,
        file: sample.file,
        name: sample.file.name,
        size: "0.05 MB",
        type: "text/plain",
        isSample: true,
      }
    ]);
  };

  const removeFile = (id) => {
    setReports((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      
      {/* Upload Box Container */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleFileDrop}
        className="relative group overflow-hidden rounded-3xl border-2 border-dashed border-slate-800 hover:border-emerald-500/50 bg-slate-900/40 hover:bg-slate-900/70 transition-all duration-300 p-8 sm:p-12 text-center"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 via-transparent to-transparent pointer-events-none" />

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.txt"
          className="hidden"
        />

        <div className="relative z-10 max-w-xl mx-auto flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform duration-300 shadow-xl shadow-emerald-500/10">
            <UploadCloud className="w-8 h-8" />
          </div>

          <div>
            <h3 className="text-xl sm:text-2xl font-bold text-slate-100">
              Upload Your Medical Report
            </h3>
            <p className="text-sm text-slate-400 mt-1">
              Drag & drop your lab results, blood test, MRI, prescription, or ECG photo here
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-400 pt-1">
            <span className="px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60">PDF</span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60">JPG / PNG</span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60">Mobile Photo</span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60">Up to 25MB</span>
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="mt-2 px-6 py-3 rounded-2xl font-semibold text-sm bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all duration-200 active:scale-95 flex items-center gap-2"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Browse Files</span>
          </button>
        </div>
      </div>

      {/* Selected File Card & Submit */}
      {reports.length > 0 && (
        <div className="bg-slate-900/90 rounded-2xl border border-emerald-500/30 p-6 space-y-4 shadow-xl shadow-emerald-950/20 animate-slideUp">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Selected Medical Document ({reports.length})</span>
            </h4>
            <button
              onClick={() => setReports([])}
              className="text-xs text-slate-400 hover:text-red-400 transition-colors"
            >
              Clear All
            </button>
          </div>

          <div className="space-y-2">
            {reports.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/80 border border-slate-800"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="truncate">
                    <p className="text-sm font-medium text-slate-200 truncate">{item.name}</p>
                    <p className="text-xs text-slate-400">{item.size} {item.isSample && "• Sample Template"}</p>
                  </div>
                </div>

                <button
                  onClick={() => removeFile(item.id)}
                  className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={onAnalyze}
            disabled={loading}
            className="w-full py-4 rounded-xl font-bold text-base bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 shadow-xl shadow-emerald-500/25 transition-all duration-200 flex items-center justify-center gap-3 disabled:opacity-50"
          >
            <Sparkles className="w-5 h-5" />
            <span>Generate Clinical AI Analysis</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Error Notice */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Analysis Notice</p>
            <p className="text-xs text-red-300/80 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Sample Report Templates */}
      <div className="space-y-4 pt-4 border-t border-slate-800/80">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Don't have a report? Try a sample template:</span>
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SAMPLE_REPORTS.map((sample) => (
            <div
              key={sample.id}
              onClick={() => handleSelectSample(sample)}
              className="group p-4 rounded-2xl bg-slate-900/50 hover:bg-slate-900 border border-slate-800 hover:border-emerald-500/40 cursor-pointer transition-all duration-200 flex flex-col justify-between gap-3 shadow-md"
            >
              <div>
                <span className="inline-block px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-400 bg-emerald-500/10 rounded-md border border-emerald-500/20 mb-2">
                  {sample.category}
                </span>
                <h5 className="text-sm font-semibold text-slate-200 group-hover:text-emerald-400 transition-colors">
                  {sample.title}
                </h5>
                <p className="text-xs text-slate-400 mt-1">{sample.description}</p>
              </div>

              <div className="flex items-center text-xs font-semibold text-emerald-400 group-hover:translate-x-1 transition-transform">
                <span>Load Sample</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

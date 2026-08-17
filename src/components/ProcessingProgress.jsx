import React from "react";
import { Activity, ShieldCheck, Sparkles, Scan, Brain } from "lucide-react";

export const ProcessingProgress = ({ ocrStatus }) => {
  return (
    <div className="max-w-xl mx-auto my-12 p-8 rounded-3xl bg-slate-900/90 border border-emerald-500/30 shadow-2xl shadow-emerald-950/40 text-center space-y-6 animate-pulse-slow">
      
      {/* Animated Orb */}
      <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
        <div className="absolute inset-2 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 opacity-20 blur-md" />
        <div className="relative w-16 h-16 rounded-2xl bg-slate-950 border border-emerald-500/50 flex items-center justify-center text-emerald-400 shadow-lg">
          <Activity className="w-8 h-8 animate-spin" style={{ animationDuration: "3s" }} />
        </div>
      </div>

      <div>
        <h3 className="text-xl font-bold text-slate-100 flex items-center justify-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-400" />
          <span>Analyzing Medical Report</span>
        </h3>
        <p className="text-sm text-slate-400 mt-1">
          Extracting biomarkers, clinical values, and risk assessments...
        </p>
      </div>

      {/* Steps Indicator */}
      <div className="space-y-3 max-w-sm mx-auto text-left text-xs text-slate-300">
        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
          <Scan className="w-4 h-4 text-emerald-400 animate-bounce" />
          <div className="flex-1">
            <div className="flex justify-between">
              <span className="font-medium text-slate-200">
                {ocrStatus?.message || "Running Tesseract WebAssembly OCR..."}
              </span>
              <span className="text-emerald-400 font-semibold">
                {Math.round((ocrStatus?.progress || 0.4) * 100)}%
              </span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
              <div
                className="bg-emerald-400 h-full transition-all duration-300 rounded-full"
                style={{ width: `${(ocrStatus?.progress || 0.4) * 100}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
          <Brain className="w-4 h-4 text-teal-400 animate-pulse" />
          <span className="font-medium text-slate-300">
            Groq Llama 3.3 Clinical Reasoning & Reference Matching
          </span>
        </div>

        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
          <ShieldCheck className="w-4 h-4 text-blue-400" />
          <span className="font-medium text-slate-300">
            Zero-Hallucination Evidence Verification
          </span>
        </div>
      </div>

    </div>
  );
};

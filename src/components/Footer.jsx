import React from "react";
import { Activity, ShieldCheck, Heart } from "lucide-react";

export const Footer = () => {
  return (
    <footer className="border-t border-slate-800/80 bg-slate-950 py-8 mt-16 text-slate-400 text-xs no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 border-b border-slate-800/60">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-slate-200">MedIntel AI Clinical System</span>
          </div>

          <div className="flex items-center gap-4 text-slate-400">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>HIPAA Compliant Data Handling</span>
            </span>
            <span>•</span>
            <span>Zero Data Selling</span>
          </div>
        </div>

        <div className="text-center space-y-2 max-w-3xl mx-auto text-[11px] text-slate-400 leading-relaxed">
          <p className="font-semibold text-slate-300">Important Medical AI Disclaimer</p>
          <p>
            MedIntel AI is an advanced clinical document parser designed for patient education, laboratory biomarker synthesis, and diagnostic reference explanation. MedIntel AI does not provide formal medical diagnosis, prescription, or direct treatment advice. Always consult a licensed healthcare professional for clinical decisions.
          </p>
        </div>

        <div className="text-center text-[11px] text-slate-400 pt-2 flex items-center justify-center gap-1">
          <span>MedIntel AI © {new Date().getFullYear()} • Engineered for Clinical Precision</span>
        </div>

      </div>
    </footer>
  );
};

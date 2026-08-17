import React, { useState, useEffect } from "react";
import { History, FileText, Calendar, Activity, ArrowRight, UserCheck, ShieldAlert } from "lucide-react";
import { apiService } from "../services/api.js";
import { formatDate, getHealthScoreColor } from "../utils/formatters.js";

export const HistorySection = ({ token, onSelectReport, onOpenAuth }) => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (token) {
      setLoading(true);
      apiService
        .getSavedReports(token)
        .then((data) => {
          setReports(data || []);
          setError(null);
        })
        .catch((err) => {
          console.warn("History error:", err.message);
          setError("Failed to load saved reports history.");
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  if (!token) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 rounded-3xl bg-slate-900/90 border border-slate-800 text-center space-y-4 shadow-xl">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto">
          <UserCheck className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-slate-100">Sign In to Save Report History</h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          Create a free MedIntel account to securely store your medical analysis history, track health score trends, and access past reports anytime.
        </p>
        <button
          onClick={onOpenAuth}
          className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-md shadow-emerald-500/20 transition-all"
        >
          Sign In or Create Account
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 text-center text-slate-400 space-y-3">
        <Activity className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
        <p className="text-sm font-medium">Fetching saved report history...</p>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 rounded-3xl bg-slate-900/90 border border-slate-800 text-center space-y-4">
        <History className="w-10 h-10 text-slate-500 mx-auto" />
        <h3 className="text-base font-bold text-slate-200">No Saved Reports Yet</h3>
        <p className="text-xs text-slate-400">
          Reports you analyze while logged in will automatically appear here for historical tracking.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-400" />
            <span>Saved Medical Reports</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {reports.length} report{reports.length === 1 ? "" : "s"} stored in your account history
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reports.map((item) => {
          const score = item.health_score || item.analysis?.section4_overallAssessment?.healthScore || 75;
          const theme = getHealthScoreColor(score);
          const name = item.analysis?.section1_patientInformation?.name || item.filename || "Medical Report";
          const testType = item.analysis?.section1_patientInformation?.testType || item.analysis?.documentType || "Diagnostic Report";

          return (
            <div
              key={item.id}
              onClick={() => onSelectReport(item.analysis)}
              className="group p-5 rounded-2xl bg-slate-900/90 hover:bg-slate-900 border border-slate-800 hover:border-emerald-500/40 cursor-pointer transition-all duration-200 space-y-4 shadow-lg"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-400 bg-emerald-500/10 rounded-md border border-emerald-500/20">
                    {testType}
                  </span>
                  <h4 className="text-sm font-bold text-slate-100 group-hover:text-emerald-400 transition-colors mt-2">
                    {name}
                  </h4>
                  <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{formatDate(item.created_at)}</span>
                  </p>
                </div>

                <div className={`px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-center`}>
                  <p className="text-[10px] text-slate-400">Score</p>
                  <p className={`text-base font-extrabold ${theme.text}`}>{score}</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs font-semibold text-emerald-400 group-hover:translate-x-1 transition-transform pt-2 border-t border-slate-800/60">
                <span>View Full Analysis</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

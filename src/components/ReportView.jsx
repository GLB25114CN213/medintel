import React from "react";
import {
  FileText,
  User,
  Activity,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Stethoscope,
  MessageSquare,
  Printer,
  Download,
  Share2,
  ShieldAlert,
  Sparkles,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  HeartPulse
} from "lucide-react";
import {
  getStatusBadgeStyle,
  getHealthScoreColor,
  formatDate
} from "../utils/formatters.js";

export const ReportView = ({ analysis, onAskAIClick }) => {
  if (!analysis) return null;

  const { section1, section2_table, section3, section4, section5, section6, section7, section8, disclaimer } = analysis;
  const healthScore = section4?.healthScore || 75;
  const scoreTheme = getHealthScoreColor(healthScore);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(analysis, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `MedIntel_Report_${section1?.name?.replace(/\s+/g, "_") || "Analysis"}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-8 animate-fadeIn printable-report">
      
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/80 border border-slate-800 no-print">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-sm font-semibold text-slate-200">Clinical Analysis Generated</span>
          <span className="text-xs text-slate-400 hidden md:inline">• Confidence: {section8?.percentage || 95}%</span>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={onAskAIClick}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Ask AI Assistant</span>
          </button>
          
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-all"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / Save PDF</span>
          </button>

          <button
            onClick={handleDownloadJSON}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: PATIENT & DOCUMENT HEADER CARD */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md">
                {section1?.testType || "Diagnostic Panel"}
              </span>
              <span className="text-xs text-slate-400">• {section1?.facilityName || "Clinical Laboratory"}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-100">
              Patient Diagnostic Report
            </h2>
          </div>

          {/* Health Score Meter */}
          <div className="flex items-center gap-4 bg-slate-950/80 p-4 rounded-2xl border border-slate-800">
            <div className="relative w-16 h-16 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="32" cy="32" r="26" stroke="#1e293b" strokeWidth="6" fill="transparent" />
                <circle
                  cx="32"
                  cy="32"
                  r="26"
                  stroke={scoreTheme.stroke}
                  strokeWidth="6"
                  strokeDasharray={163}
                  strokeDashoffset={163 - (163 * healthScore) / 100}
                  strokeLinecap="round"
                  fill="transparent"
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <span className={`absolute text-base font-extrabold ${scoreTheme.text}`}>
                {healthScore}
              </span>
            </div>

            <div>
              <p className="text-xs text-slate-400 font-medium">Health Index</p>
              <p className={`text-sm font-bold ${scoreTheme.text}`}>{scoreTheme.label}</p>
              <p className="text-[10px] text-slate-500">Based on biomarker analysis</p>
            </div>
          </div>
        </div>

        {/* Patient Metadata Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6">
          <div className="space-y-1">
            <p className="text-xs text-slate-400">Patient Name</p>
            <p className="text-sm font-bold text-slate-200">{section1?.name}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-400">Age / Gender</p>
            <p className="text-sm font-bold text-slate-200">{section1?.age} / {section1?.gender}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-400">Patient ID</p>
            <p className="text-sm font-bold text-slate-200">{section1?.patientId}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-400">Report Date</p>
            <p className="text-sm font-bold text-slate-200">{formatDate(section1?.testDate)}</p>
          </div>
        </div>
      </div>

      {/* SECTION 4: OVERALL CLINICAL ASSESSMENT */}
      <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
        <h3 className="text-base font-bold text-slate-200 flex items-center gap-2">
          <Activity className="w-5 h-5 text-emerald-400" />
          <span>Overall Clinical Summary</span>
        </h3>
        <p className="text-sm text-slate-300 leading-relaxed bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
          {section4?.summary || "Report parameters evaluated against standard diagnostic criteria."}
        </p>
      </div>

      {/* SECTION 3: KEY FINDINGS CARDS */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-slate-200 flex items-center gap-2">
          <HeartPulse className="w-5 h-5 text-emerald-400" />
          <span>Key Findings & Clinical Importance</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Critical Findings */}
          {section3?.criticalFindings?.length > 0 && (
            <div className="p-5 rounded-2xl bg-red-500/10 border border-red-500/30 space-y-3">
              <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                <ShieldAlert className="w-5 h-5" />
                <span>Critical Findings ({section3.criticalFindings.length})</span>
              </div>
              <ul className="space-y-2">
                {section3.criticalFindings.map((item, idx) => (
                  <li key={idx} className="text-xs text-slate-200 bg-slate-950/60 p-3 rounded-xl border border-red-500/20">
                    <span className="font-bold text-red-400 block mb-1">{item.title}</span>
                    <span className="text-slate-300">{item.explanation}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Abnormal Findings */}
          {section3?.abnormalFindings?.length > 0 && (
            <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <AlertTriangle className="w-5 h-5" />
                <span>Out of Range Biomarkers ({section3.abnormalFindings.length})</span>
              </div>
              <ul className="space-y-2">
                {section3.abnormalFindings.map((item, idx) => (
                  <li key={idx} className="text-xs text-slate-200 bg-slate-950/60 p-3 rounded-xl border border-amber-500/20">
                    <span className="font-bold text-amber-400 block mb-1">{item.title}</span>
                    <span className="text-slate-300">{item.explanation}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Borderline Findings */}
          {section3?.borderlineFindings?.length > 0 && (
            <div className="p-5 rounded-2xl bg-purple-500/10 border border-purple-500/30 space-y-3">
              <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
                <AlertCircle className="w-5 h-5" />
                <span>Borderline Watch Parameters ({section3.borderlineFindings.length})</span>
              </div>
              <ul className="space-y-2">
                {section3.borderlineFindings.map((item, idx) => (
                  <li key={idx} className="text-xs text-slate-200 bg-slate-950/60 p-3 rounded-xl border border-purple-500/20">
                    <span className="font-bold text-purple-400 block mb-1">{item.title}</span>
                    <span className="text-slate-300">{item.explanation}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Normal Findings */}
          {section3?.normalFindings?.length > 0 && (
            <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5" />
                <span>Optimal Normal Parameters ({section3.normalFindings.length})</span>
              </div>
              <ul className="space-y-2">
                {section3.normalFindings.map((item, idx) => (
                  <li key={idx} className="text-xs text-slate-200 bg-slate-950/60 p-3 rounded-xl border border-emerald-500/20">
                    <span className="font-bold text-emerald-400 block mb-1">{item.title}</span>
                    <span className="text-slate-300">{item.explanation}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>
      </div>

      {/* SECTION 2: TEST SUMMARY TABLE */}
      <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4 overflow-hidden">
        <h3 className="text-base font-bold text-slate-200 flex items-center gap-2">
          <FileText className="w-5 h-5 text-emerald-400" />
          <span>Biomarker Table & Reference Ranges</span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="p-3.5 rounded-l-xl">Test Parameter</th>
                <th className="p-3.5">Result</th>
                <th className="p-3.5">Unit</th>
                <th className="p-3.5">Reference Range</th>
                <th className="p-3.5 rounded-r-xl">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {(section2_table || []).map((row, idx) => {
                const badge = getStatusBadgeStyle(row.status);
                return (
                  <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-3.5 font-semibold text-slate-100">{row.testName}</td>
                    <td className="p-3.5 font-bold text-slate-200">{row.result}</td>
                    <td className="p-3.5 text-slate-400">{row.unit}</td>
                    <td className="p-3.5 text-slate-400">{row.referenceRange}</td>
                    <td className="p-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${badge.bg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                        <span>{badge.text}</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 5 & 6: POSSIBLE CAUSES & FOLLOW-UP */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Possible Causes */}
        {section5?.length > 0 && (
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
            <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-amber-400" />
              <span>Potential Underlying Causes</span>
            </h4>
            <div className="space-y-3 text-xs">
              {section5.map((item, idx) => (
                <div key={idx} className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <p className="font-semibold text-amber-400">{item.abnormalValue}</p>
                  <p className="text-slate-300">{(item.causes || []).join(", ")}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Follow Up Recommendations */}
        {section6 && (
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
            <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-emerald-400" />
              <span>Recommended Follow-Up & Specialist</span>
            </h4>

            <div className="space-y-3 text-xs">
              {section6.specialistConsultation && (
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                  <span className="font-semibold text-emerald-400 block mb-0.5">Recommended Specialist:</span>
                  <span>{section6.specialistConsultation}</span>
                </div>
              )}

              {section6.repeatTesting && (
                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <span className="font-semibold text-slate-300 block mb-0.5">Repeat Testing Window:</span>
                  <span className="text-slate-400">{section6.repeatTesting}</span>
                </div>
              )}

              {section6.lifestyleMeasures?.length > 0 && (
                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <span className="font-semibold text-slate-300 block">Lifestyle & Dietary Guidance:</span>
                  <ul className="list-disc list-inside text-slate-400 space-y-0.5">
                    {section6.lifestyleMeasures.map((m, idx) => (
                      <li key={idx}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* SECTION 7: EASY PATIENT EXPLANATION */}
      {section7 && (
        <div className="p-6 rounded-3xl bg-gradient-to-r from-teal-950/40 via-slate-900 to-slate-900 border border-teal-500/30 space-y-3">
          <h4 className="text-sm font-bold text-teal-400 flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            <span>Patient-Friendly Summary (Plain Language)</span>
          </h4>
          <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
            {section7}
          </p>
        </div>
      )}

      {/* DISCLAIMER */}
      <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-400 text-center space-y-1">
        <p className="font-semibold text-slate-300">Medical AI Educational Disclaimer</p>
        <p>{disclaimer || "This AI analysis is generated for informational purposes only and does not constitute formal medical diagnosis or treatment."}</p>
      </div>

    </div>
  );
};

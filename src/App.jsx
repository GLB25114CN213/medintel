import React, { useState, useEffect } from "react";
import { Header } from "./components/Header.jsx";
import { UploadSection } from "./components/UploadSection.jsx";
import { ProcessingProgress } from "./components/ProcessingProgress.jsx";
import { ReportView } from "./components/ReportView.jsx";
import { AIChat } from "./components/AIChat.jsx";
import { HistorySection } from "./components/HistorySection.jsx";
import { AuthModal } from "./components/AuthModal.jsx";
import { Footer } from "./components/Footer.jsx";
import { apiService } from "./services/api.js";
import { extractImageTextClient } from "./utils/ocr.js";

export function App() {
  const [activeTab, setActiveTab] = useState("analyze");
  const [reports, setReports] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState(null);
  const [error, setError] = useState(null);

  // Authentication State
  const [token, setToken] = useState(() => localStorage.getItem("medintel_token") || null);
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("medintel_user");
    return saved ? JSON.parse(saved) : null;
  });
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Fetch current user if token exists
  useEffect(() => {
    if (token && !user) {
      apiService
        .getCurrentUser(token)
        .then((res) => {
          if (res?.user) {
            setUser(res.user);
            localStorage.setItem("medintel_user", JSON.stringify(res.user));
          }
        })
        .catch(() => handleLogout());
    }
  }, [token]);

  const handleAuthSuccess = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem("medintel_token", newToken);
    localStorage.setItem("medintel_user", JSON.stringify(newUser));
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("medintel_token");
    localStorage.removeItem("medintel_user");
  };

  // Main Report Analysis Execution
  const handleAnalyze = async () => {
    if (reports.length === 0) {
      setError("Please select or upload a medical report document.");
      return;
    }

    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const targetFile = reports[0].file;

      // 1. Client-Side Browser OCR Extraction
      const clientOcrText = await extractImageTextClient(targetFile, (status) => {
        setOcrStatus(status);
      });

      // 2. Server AI Processing
      setOcrStatus({ status: "ai", progress: 0.9, message: "Groq Llama 3.3 Clinical Reasoning..." });
      const data = await apiService.analyzeReport(targetFile, clientOcrText, token);

      if (data.analysis) {
        setAnalysis(data.analysis);
        setActiveTab("analyze");
      } else {
        throw new Error("Invalid response received from medical AI.");
      }
    } catch (err) {
      console.error("Analysis Error:", err);
      setError(err.message || "Failed to analyze document. Please check the file and try again.");
    } finally {
      setLoading(false);
      setOcrStatus(null);
    }
  };

  const handleSelectHistoryReport = (selectedAnalysis) => {
    setAnalysis(selectedAnalysis);
    setActiveTab("analyze");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-300 flex flex-col justify-between">
      
      {/* Header Bar */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onOpenAuth={() => setAuthModalOpen(true)}
        onLogout={handleLogout}
        hasAnalysis={!!analysis}
      />

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        
        {/* Tab 1: Analyze Report */}
        {activeTab === "analyze" && (
          <div className="space-y-8">
            {!analysis && !loading && (
              <UploadSection
                reports={reports}
                setReports={setReports}
                onAnalyze={handleAnalyze}
                loading={loading}
                error={error}
              />
            )}

            {loading && <ProcessingProgress ocrStatus={ocrStatus} />}

            {analysis && !loading && (
              <div className="space-y-6">
                <button
                  onClick={() => {
                    setAnalysis(null);
                    setReports([]);
                  }}
                  className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 no-print"
                >
                  <span>← Analyze Another Medical Document</span>
                </button>

                <ReportView
                  analysis={analysis}
                  onAskAIClick={() => setActiveTab("chat")}
                />
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Report History */}
        {activeTab === "history" && (
          <HistorySection
            token={token}
            onSelectReport={handleSelectHistoryReport}
            onOpenAuth={() => setAuthModalOpen(true)}
          />
        )}

        {/* Tab 3: AI Health Assistant Chat */}
        {activeTab === "chat" && (
          <AIChat
            analysis={analysis}
            token={token}
          />
        )}

      </main>

      {/* Footer */}
      <Footer />

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />

    </div>
  );
}

export default App;

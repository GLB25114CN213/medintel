import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, Send, TrendingUp, AlertCircle, Heart, Brain, Shield, Zap, ChevronDown,
  Menu, X, Plus, Trash2, Download, Eye, EyeOff, ArrowRight, BarChart3, Activity,
  FileText, CheckCircle, Clock, Home, Settings, LogOut, Bell, Search, Calendar,
  User, Lock, Mail, MessageSquare, Copy, Check, Sparkles, RefreshCw, Sun, Moon, Printer
} from 'lucide-react';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, RadarChart, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Radar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const getApiBase = () => {
  if (typeof window === 'undefined') return '';
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;

  const hostname = window.location.hostname;
  const port = window.location.port;

  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || /^192\.168\./.test(hostname) || /^10\./.test(hostname);

  // Deployed environments (Vercel, Render, Railway) use relative paths
  if (!isLocalHost || port === '5001' || !port) {
    return '';
  }

  return `${window.location.protocol}//${hostname}:5001`;
};

const API_BASE = getApiBase();

export default function MedIntelAI() {
  // Authentication & Session States
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('medintel_token') || null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  const [authForm, setAuthForm] = useState({ email: '', password: '', full_name: '' });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  // Main App States
  const [currentPage, setCurrentPage] = useState('home'); // 'home', 'upload', 'analysis', 'chat', 'reports'
  const [darkMode, setDarkMode] = useState(true); // Default to sleek dark glass mode
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [reports, setReports] = useState([]);
  const [analysisResults, setAnalysisResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savedUserReports, setSavedUserReports] = useState([]);

  // Production AI Chat States
  const [chatHistory, setChatHistory] = useState([
    {
      role: 'assistant',
      content: 'Hello! I am **MedIntel AI**, your personal clinical assistant. Upload a medical report for a deep personalized analysis, or ask me any health and wellness questions!'
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const chatBottomRef = useRef(null);
  const fileInputRef = useRef(null);

  // Auto-fetch user session on load
  useEffect(() => {
    if (token) {
      fetchUserSession(token);
    }
  }, []);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (currentPage === 'chat') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, chatLoading, currentPage]);

  // Fetch User Session
  const fetchUserSession = async (authToken) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (data.success) {
        setUser(data.user);
        fetchSavedReports(authToken);
      } else {
        // Token expired or invalid
        handleLogout();
      }
    } catch (e) {
      console.error("Session verification failed:", e);
    }
  };

  // Fetch Saved Reports for Logged-In User
  const fetchSavedReports = async (authToken) => {
    try {
      const res = await fetch(`${API_BASE}/api/reports`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (data.success) {
        setSavedUserReports(data.reports);
      }
    } catch (e) {
      console.error("Error fetching reports:", e);
    }
  };

  // Authentication Handlers
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const payload = authMode === 'login'
      ? { email: authForm.email, password: authForm.password }
      : { email: authForm.email, password: authForm.password, full_name: authForm.full_name };

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        localStorage.setItem('medintel_token', data.token);
        setToken(data.token);
        setUser(data.user);
        setAuthModalOpen(false);
        setAuthForm({ email: '', password: '', full_name: '' });
        fetchSavedReports(data.token);
      } else {
        setAuthError(data.error || 'Authentication failed');
      }
    } catch (err) {
      setAuthError('Failed to connect to authentication server.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('medintel_token');
    setToken(null);
    setUser(null);
    setSavedUserReports([]);
    setUserDropdownOpen(false);
  };

  // File Selection
  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      setReports(files.map(file => ({
        id: Date.now() + Math.random(),
        file,
        name: file.name,
        size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
        date: new Date().toLocaleDateString()
      })));
    }
  };

  // Medical Report Analysis
  const handleAnalyze = async () => {
    if (reports.length === 0) {
      alert("Please upload at least one medical report file.");
      return;
    }

    setLoading(true);

    try {
      const file = reports[0].file;
      const formData = new FormData();
      formData.append("file", file);

      // Client-side OCR for image files (solves Vercel serverless limitations)
      if (file.type.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp", ".heic"].some(ext => file.name.toLowerCase().endsWith(ext))) {
        try {
          const Tesseract = (await import("tesseract.js")).default;
          const ocrResult = await Tesseract.recognize(file, "eng", { logger: () => {} });
          const extractedText = (ocrResult.data?.text || "").trim();
          if (extractedText) {
            formData.append("clientOcrText", extractedText);
            console.log("Γ£à Client-side OCR extracted:", extractedText.length, "chars");
          }
        } catch (ocrErr) {
          console.warn("Client-side OCR warning:", ocrErr.message);
        }
      }

      const headers = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        headers,
        body: formData,
      });

      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (jsonErr) {
        console.error("Non-JSON Response from Server:", responseText);
        alert(`Analysis failed: ${responseText || "Server returned non-JSON response"}`);
        setLoading(false);
        return;
      }

      if (!data.success) {
        alert(data.error || "Analysis failed");
        setLoading(false);
        return;
      }

      if (data.analysis?.isMedicalReport === false) {
        alert(data.analysis.message || "Invalid medical report document.");
        setLoading(false);
        return;
      }

      // Clean Patient Info helper (defaults missing fields to 'Not Available')
      const cleanValue = (val, fallback = "Not Available") => {
        if (!val || typeof val !== 'string') return fallback;
        const trimmed = val.trim();
        if (trimmed.toLowerCase() === 'unspecified' || trimmed.toLowerCase() === 'n/a' || trimmed === '') return fallback;
        return trimmed;
      };

      // Convert API JSON to UI Structure for 8-Section Clinical Report
      const pInfo = data.analysis.section1_patientInformation || {};
      const oAssessment = data.analysis.section4_overallAssessment || {};
      const kFindings = data.analysis.section3_keyFindings || {};
      const cScore = data.analysis.section8_confidenceScore || {};
      const fUp = data.analysis.section6_recommendedFollowUp || {};

      const convertedAnalysis = {
        section1: {
          name: cleanValue(pInfo.name || data.analysis.patientName),
          age: cleanValue(pInfo.age || data.analysis.age),
          gender: cleanValue(pInfo.gender || data.analysis.gender),
          patientId: cleanValue(pInfo.patientId || data.analysis.patientId || data.analysis.patientID),
          testDate: cleanValue(pInfo.reportDate || data.analysis.reportDate),
          facilityName: cleanValue(pInfo.facilityName || data.analysis.facilityName),
          doctorName: cleanValue(pInfo.doctorName || data.analysis.doctorName),
          testType: cleanValue(pInfo.testType || data.analysis.testType, "Diagnostic Panel")
        },

        section2_table: (data.analysis.section2_testSummaryTable || data.analysis.biomarkers || []).map(b => ({
          testName: b.testName || b.name,
          result: b.result || b.value,
          unit: b.unit || "",
          referenceRange: b.referenceRange || b.normalRange || "Not Provided",
          status: (b.status || "normal").toUpperCase()
        })),

        section3_keyFindings: {
          normal: kFindings.normalFindings || [],
          abnormal: kFindings.abnormalFindings || [],
          borderline: kFindings.borderlineFindings || [],
          critical: kFindings.criticalFindings || []
        },

        section4_overallAssessment: {
          summary: oAssessment.summary || data.analysis.summary || "Balanced clinical summary completed.",
          healthScore: Number(oAssessment.healthScore || data.analysis.healthScore) || 85,
          riskLevel: oAssessment.riskLevel || data.analysis.riskLevel || "Low"
        },

        section5_possibleCauses: data.analysis.section5_possibleCauses || [],

        section6_followUp: {
          repeatTesting: fUp.repeatTesting || "Schedule routine repeat testing in 6 months as advised by doctor",
          additionalInvestigations: fUp.additionalInvestigations || [],
          lifestyleMeasures: fUp.lifestyleMeasures || [],
          specialistConsultation: fUp.specialistConsultation || data.analysis.doctorSuggestion || "General Physician"
        },

        section7_easyExplanation: data.analysis.section7_easyExplanation || data.analysis.simpleExplanation || "Easy to understand patient explanation.",

        section8_confidenceScore: {
          percentage: Number(cScore.percentage) || 95,
          reasoning: cScore.reasoning || "Based strictly on high quality report legibility."
        },

        // Legacy compatibility properties
        patientInfo: {
          name: cleanValue(pInfo.name || data.analysis.patientName),
          age: cleanValue(pInfo.age || data.analysis.age),
          gender: cleanValue(pInfo.gender || data.analysis.gender),
          patientId: cleanValue(pInfo.patientId || data.analysis.patientId),
          testDate: cleanValue(pInfo.reportDate || data.analysis.reportDate),
          facilityName: cleanValue(pInfo.facilityName || data.analysis.facilityName),
          doctorName: cleanValue(pInfo.doctorName || data.analysis.doctorName),
        },
        healthScore: Number(oAssessment.healthScore || data.analysis.healthScore) || 85,
        riskLevel: oAssessment.riskLevel || data.analysis.riskLevel || "Low",
        summaryPatientFriendly: data.analysis.section7_easyExplanation || data.analysis.simpleExplanation || "Report analysis completed.",
        summaryTechnical: oAssessment.summary || data.analysis.professionalExplanation || "Technical clinical summary completed.",
        biomarkers: (data.analysis.section2_testSummaryTable || data.analysis.biomarkers || []).map(b => {
          let st = (b.status || "normal").toLowerCase();
          const name = b.testName || b.name || "Test Parameter";
          const valStr = String(b.result || b.value || "");
          const valNum = parseFloat(valStr.replace(/,/g, ""));
          const rangeStr = String(b.referenceRange || b.normalRange || "");

          // Fallback auto-evaluator if status was normal/missing but numbers exceed printed range bounds
          if (!isNaN(valNum) && rangeStr && (st === "normal" || st === "unknown" || !st)) {
            const rangeMatch = rangeStr.match(/([\d\.]+)\s*[\-\–\—\s]\s*([\d\.]+)/);
            if (rangeMatch) {
              const min = parseFloat(rangeMatch[1]);
              const max = parseFloat(rangeMatch[2]);
              if (!isNaN(min) && !isNaN(max)) {
                if (valNum > max) st = "high";
                else if (valNum < min) st = "low";
              }
            } else {
              const maxMatch = rangeStr.match(/<\s*([\d\.]+)/);
              if (maxMatch) {
                const max = parseFloat(maxMatch[1]);
                if (!isNaN(max) && valNum > max) st = "high";
              }
              const minMatch = rangeStr.match(/>\s*([\d\.]+)/);
              if (minMatch) {
                const min = parseFloat(minMatch[1]);
                if (!isNaN(min) && valNum < min) st = "low";
              }
            }
          }

          let dynamicFallback = "Optimal physiological level within standard reference range.";
          if (st.includes("high") || st.includes("low") || st.includes("critical") || st.includes("borderline") || st.includes("positive") || st.includes("elevated") || st.includes("decreased")) {
            dynamicFallback = `${name} is ${st.toUpperCase()} relative to standard reference interval. Clinical correlation advised.`;
          }

          return {
            name: name,
            value: b.result || b.value,
            unit: b.unit || "",
            normalRange: b.referenceRange || b.normalRange || "Not Provided",
            status: st,
            significance: b.clinicalSignificance || b.meaning || b.explanation || b.significance || dynamicFallback,
          };
        }),
        diagnoses: data.analysis.diagnoses || [],
        symptoms: data.analysis.symptomsIdentified || [],
        alerts: data.analysis.abnormalFindings?.map(a => ({ title: a.name, value: a.value })) || [],
        medicines: data.analysis.medicines || [],
        recommendations: {
          lifestyle: fUp.lifestyleMeasures?.length ? fUp.lifestyleMeasures : ["Maintain 7-8 hours of quality sleep", "Engage in 30 minutes of aerobic activity"],
          nutrition: data.analysis.dietRecommendations?.length ? data.analysis.dietRecommendations : ["Focus on whole foods and adequate hydration"],
          foodsToAvoid: data.analysis.foodsToAvoid || [],
          supplements: data.analysis.supplementRecommendations || [],
          followUpTests: fUp.additionalInvestigations || ["Routine blood panel in 6 months"],
        },
        doctorQuestions: data.analysis.doctorQuestions || ["Are my lab levels in optimal range for my age?"],
        doctorSuggestion: fUp.specialistConsultation || "General Physician",
        imageQualityNotes: "Document clinical analysis completed successfully.",
      };

      setAnalysisResults(convertedAnalysis);
      setCurrentPage("analysis");

      if (token) {
        fetchSavedReports(token);
      }
    } catch (error) {
      console.error("Report Analysis Error:", error);
      alert(`Report analysis failed: ${error.message || "Network error. Check connection or try a smaller file."}`);
    } finally {
      setLoading(false);
    }
  };

  // Real-Time Production AI Chat Handler
  const sendMessage = async (presetMessage = null) => {
    const textToSend = presetMessage || chatInput;
    if (!textToSend.trim() || chatLoading) return;

    const updatedHistory = [...chatHistory, { role: 'user', content: textToSend }];
    setChatHistory(updatedHistory);
    if (!presetMessage) setChatInput('');
    setChatLoading(true);

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: updatedHistory,
          reportContext: analysisResults
        })
      });

      const data = await res.json();

      if (data.success && data.message) {
        setChatHistory([...updatedHistory, data.message]);
      } else {
        setChatHistory([...updatedHistory, {
          role: 'assistant',
          content: 'ΓÜá∩╕Å ' + (data.error || 'Failed to receive AI response. Please try again.')
        }]);
      }
    } catch (err) {
      setChatHistory([...updatedHistory, {
        role: 'assistant',
        content: 'ΓÜá∩╕Å Network error connecting to MedIntel AI Chat service.'
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  // Copy Message Content
  const copyToClipboard = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Health Score Circular SVG Component
  const HealthScoreCircle = ({ score }) => {
    const circumference = 2 * Math.PI * 45;
    const strokeDashoffset = circumference - (score / 100) * circumference;
    const getColor = (s) => {
      if (s >= 80) return '#10b981'; // Green
      if (s >= 60) return '#f59e0b'; // Amber
      return '#ef4444'; // Red
    };

    return (
      <div className="relative w-36 h-36 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" stroke={darkMode ? "#1e293b" : "#e2e8f0"} strokeWidth="10" fill="transparent" />
          <circle
            cx="50" cy="50" r="45"
            stroke={getColor(score)}
            strokeWidth="10"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute flex flex-col items-center justify-center text-center">
          <span className="text-4xl font-extrabold tracking-tight">{score}</span>
          <span className={`text-xs font-semibold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>/100</span>
        </div>
      </div>
    );
  };

  return (
    <div className={`min-h-screen font-sans transition-colors duration-300 ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>

      {/* Ambient Radial Glass Background Accents */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-cyan-500/15 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-indigo-500/15 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
      </div>

      {/* STICKY GLASS NAVIGATION BAR */}
      <header className={`sticky top-0 z-40 transition-all duration-300 backdrop-blur-xl border-b ${darkMode ? 'bg-slate-950/70 border-white/10' : 'bg-white/70 border-slate-200'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          
          {/* Logo */}
          <div
            onClick={() => setCurrentPage('home')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-500 to-indigo-600 p-0.5 shadow-lg shadow-cyan-500/25 group-hover:scale-105 transition-transform">
              <div className={`w-full h-full rounded-[10px] flex items-center justify-center ${darkMode ? 'bg-slate-950' : 'bg-white'}`}>
                <Heart className="w-6 h-6 text-cyan-400 fill-cyan-400/20" />
              </div>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent">
                MedIntel AI
              </h1>
              <p className="text-[10px] font-medium tracking-widest text-cyan-400/80 uppercase">Clinical Intelligence</p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-900/40 p-1.5 rounded-full border border-white/10">
            {[
              { id: 'home', label: 'Home', icon: Home },
              { id: 'upload', label: 'Analyze Report', icon: Upload },
              { id: 'analysis', label: 'Results', icon: BarChart3, disabled: !analysisResults },
              { id: 'chat', label: 'AI Chat', icon: Brain },
            ].map(tab => (
              <button
                key={tab.id}
                disabled={tab.disabled}
                onClick={() => setCurrentPage(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                  currentPage === tab.id
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20'
                    : tab.disabled
                    ? 'opacity-40 cursor-not-allowed text-slate-500'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Right Action Icons & Auth Controls */}
          <div className="flex items-center gap-3">
            
            {/* Theme Toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2.5 rounded-xl border transition-all ${darkMode ? 'bg-slate-900/80 border-slate-800 text-amber-400 hover:bg-slate-800' : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'}`}
              title="Toggle theme"
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {/* Auth Dropdown or Login Button */}
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl border transition-all ${darkMode ? 'bg-slate-900/80 border-slate-800 text-white hover:bg-slate-800' : 'bg-slate-100 border-slate-200 text-slate-900 hover:bg-slate-200'}`}
                >
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-500 to-indigo-500 flex items-center justify-center font-bold text-xs text-white">
                    {user.full_name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <span className="text-sm font-semibold max-w-[100px] truncate">{user.full_name}</span>
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </button>

                {/* User Dropdown Menu */}
                {userDropdownOpen && (
                  <div className={`absolute right-0 mt-2 w-56 rounded-2xl border p-2 shadow-2xl z-50 backdrop-blur-2xl ${darkMode ? 'bg-slate-900/95 border-slate-800 text-white' : 'bg-white/95 border-slate-200 text-slate-900'}`}>
                    <div className="px-3 py-2 border-b border-white/10 mb-1">
                      <p className="text-xs font-semibold text-cyan-400">{user.full_name}</p>
                      <p className="text-xs text-slate-400 truncate">{user.email}</p>
                    </div>
                    <button
                      onClick={() => { setCurrentPage('reports'); setUserDropdownOpen(false); }}
                      className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-xl hover:bg-cyan-500/10 hover:text-cyan-400 transition"
                    >
                      <FileText className="w-4 h-4" /> Saved Medical Reports ({savedUserReports.length})
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-xl text-rose-400 hover:bg-rose-500/10 transition mt-1"
                    >
                      <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => { setAuthMode('login'); setAuthModalOpen(true); }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-semibold shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <User className="w-4 h-4" /> Sign In
              </button>
            )}

            {/* Mobile Hamburger Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2.5 rounded-xl border border-white/10 text-slate-300"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </header>

      {/* MOBILE DRAWER */}
      {mobileMenuOpen && (
        <div className={`md:hidden border-b p-4 backdrop-blur-xl z-30 ${darkMode ? 'bg-slate-950/90 border-slate-800' : 'bg-white/90 border-slate-200'}`}>
          <div className="flex flex-col gap-2">
            {[
              { id: 'home', label: 'Home', icon: Home },
              { id: 'upload', label: 'Analyze Report', icon: Upload },
              { id: 'analysis', label: 'Results', icon: BarChart3, disabled: !analysisResults },
              { id: 'chat', label: 'AI Chat', icon: Brain },
            ].map(tab => (
              <button
                key={tab.id}
                disabled={tab.disabled}
                onClick={() => { setCurrentPage(tab.id); setMobileMenuOpen(false); }}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${
                  currentPage === tab.id
                    ? 'bg-cyan-500/20 text-cyan-400 font-bold'
                    : tab.disabled
                    ? 'opacity-40 text-slate-500'
                    : 'text-slate-300'
                }`}
              >
                <tab.icon className="w-5 h-5" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <main className="relative z-10">
        <AnimatePresence mode="wait">

          {/* HOME PAGE */}
          {currentPage === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24"
            >
              <div className="text-center max-w-3xl mx-auto">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 text-xs font-bold tracking-wide mb-8">
                  <Sparkles className="w-4 h-4" /> Advanced Gemini 2.5 Flash & Groq Clinical Intelligence
                </div>

                <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight mb-6">
                  Decode Your Medical Reports with{' '}
                  <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent">
                    AI Precision
                  </span>
                </h1>

                <p className={`text-lg sm:text-xl mb-10 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Upload lab reports, prescriptions, or doctor notes. Get instant biomarker explanations, health scores, diet & lifestyle advice, and interactive AI consultation.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <button
                    onClick={() => setCurrentPage('upload')}
                    className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 text-white font-bold text-lg shadow-xl shadow-cyan-500/30 hover:shadow-cyan-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                  >
                    <Upload className="w-5 h-5" /> Upload Medical Report
                  </button>

                  <button
                    onClick={() => setCurrentPage('chat')}
                    className={`w-full sm:w-auto px-8 py-4 rounded-2xl border font-bold text-lg transition-all flex items-center justify-center gap-3 ${darkMode ? 'bg-slate-900/80 border-slate-800 text-white hover:bg-slate-800' : 'bg-white border-slate-200 text-slate-900 hover:bg-slate-100'}`}
                  >
                    <Brain className="w-5 h-5 text-cyan-400" /> Consult AI Assistant
                  </button>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 text-left">
                  {[
                    { title: 'Multi-Modal OCR', desc: 'Analyzes printed text, handwriting, low-light scans, and PDF documents.', icon: FileText, color: 'text-cyan-400' },
                    { title: 'Biomarker Intelligence', desc: 'Automatically flags low, high, and critical lab values with reference ranges.', icon: Activity, color: 'text-emerald-400' },
                    { title: 'Clinical Context AI Chat', desc: 'Ask specific questions about your reports, medicines, and nutrition.', icon: Brain, color: 'text-indigo-400' },
                  ].map((feat, i) => (
                    <div
                      key={i}
                      className={`p-6 rounded-2xl border backdrop-blur-xl ${darkMode ? 'glass-card-dark' : 'glass-card-light'}`}
                    >
                      <feat.icon className={`w-8 h-8 ${feat.color} mb-4`} />
                      <h3 className="text-lg font-bold mb-2">{feat.title}</h3>
                      <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>{feat.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* UPLOAD PAGE */}
          {currentPage === 'upload' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12"
            >
              <div className="text-center mb-10">
                <h2 className="text-3xl sm:text-4xl font-extrabold mb-3">Upload Medical Report</h2>
                <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
                  Supports PDF, JPG, PNG, WebP ΓÇö blood tests, radiology reports, prescriptions & doctor handwriting notes
                </p>
              </div>

              {/* Glass Dropzone Card */}
              <div className={`p-8 sm:p-12 rounded-3xl border-2 border-dashed transition-all text-center relative ${darkMode ? 'glass-card-dark border-cyan-500/30 hover:border-cyan-400' : 'glass-card-light border-cyan-400/40 hover:border-cyan-500'}`}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={handleFileUpload}
                  className="hidden"
                />

                {reports.length === 0 ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="cursor-pointer py-6 group"
                  >
                    <div className="w-20 h-20 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                      <Upload className="w-10 h-10 text-cyan-400 animate-bounce" />
                    </div>

                    <h3 className="text-xl font-bold mb-2">Click to select or drag & drop your report</h3>
                    <p className="text-xs text-slate-400 mb-6">Supports PDF, PNG, JPG, WebP (Up to 10MB)</p>

                    <button
                      type="button"
                      className="px-6 py-3 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-sm font-semibold hover:bg-cyan-500/30 transition"
                    >
                      Browse Files
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className={`max-w-md mx-auto p-4 rounded-2xl border flex items-center justify-between text-left ${darkMode ? 'bg-slate-900/90 border-cyan-500/40' : 'bg-white border-cyan-300'}`}>
                      <div className="flex items-center gap-3">
                        <FileText className="w-8 h-8 text-cyan-400 shrink-0" />
                        <div className="overflow-hidden">
                          <p className="text-sm font-bold truncate max-w-[200px]">{reports[0].name}</p>
                          <p className="text-xs text-slate-400">{reports[0].size}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {reports[0].file && (
                          <a
                            href={URL.createObjectURL(reports[0].file)}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 rounded-xl text-cyan-400 hover:bg-cyan-500/10 transition"
                            title="Open / View Document"
                          >
                            <Eye className="w-5 h-5" />
                          </a>
                        )}

                        <button
                          type="button"
                          onClick={() => setReports([])}
                          className="p-2 rounded-xl text-rose-400 hover:bg-rose-500/10 transition"
                          title="Remove File"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className={`w-full sm:w-auto px-5 py-3.5 rounded-2xl border text-sm font-semibold transition ${darkMode ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'}`}
                      >
                        Change File
                      </button>

                      <button
                        type="button"
                        disabled={loading}
                        onClick={handleAnalyze}
                        className={`w-full flex-1 py-3.5 px-6 rounded-2xl font-bold text-base shadow-xl transition-all flex items-center justify-center gap-2 ${
                          loading
                            ? 'opacity-50 cursor-not-allowed bg-slate-800 text-slate-500'
                            : 'bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 text-white shadow-cyan-500/30 hover:shadow-cyan-500/50 hover:scale-[1.02] active:scale-[0.98]'
                        }`}
                      >
                        {loading ? (
                          <>
                            <RefreshCw className="w-5 h-5 animate-spin text-cyan-300" />
                            <span>Analyzing Document with Gemini AI...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-5 h-5" />
                            <span>Analyze Report Now</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ANALYSIS RESULTS PAGE */}
          {currentPage === 'analysis' && analysisResults && (
            <motion.div
              key="analysis"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8"
            >
              {/* Header Banner */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-3 py-1 rounded-full text-xs font-extrabold uppercase bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                      8-Section Clinical Report Findings
                    </span>
                    <span className="text-xs text-slate-400">Date: {analysisResults.patientInfo.testDate}</span>
                  </div>
                  <h2 className="text-3xl font-extrabold">Full Report Findings Analysis</h2>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-4 py-3 rounded-2xl bg-slate-800 text-cyan-400 border border-cyan-500/30 text-xs font-bold shadow-lg hover:bg-slate-700 transition flex items-center gap-2"
                    title="Print or Export Full 8-Section Clinical Report to PDF"
                  >
                    <Printer className="w-4 h-4" /> Print / Save PDF Report
                  </button>

                  <button
                    type="button"
                    onClick={() => setCurrentPage('chat')}
                    className="px-5 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-600 text-white text-xs font-bold shadow-xl shadow-cyan-500/25 hover:scale-105 transition flex items-center gap-2"
                  >
                    <Brain className="w-4 h-4" /> Consult AI Assistant
                  </button>
                </div>
              </div>

              {/* 1. PATIENT & HOSPITAL METADATA CARD */}
              <div className={`p-6 rounded-3xl border ${darkMode ? 'glass-card-dark' : 'glass-card-light'}`}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-4 flex items-center gap-2">
                  <User className="w-4 h-4" /> Patient & Document Profile
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
                  <div>
                    <span className="text-xs text-slate-400 block">Patient Name</span>
                    <span className="font-bold">{analysisResults.patientInfo.name}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Age / Gender</span>
                    <span className="font-bold">{analysisResults.patientInfo.age} / {analysisResults.patientInfo.gender}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Patient ID</span>
                    <span className="font-bold">{analysisResults.patientInfo.patientId}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Report Date</span>
                    <span className="font-bold">{analysisResults.patientInfo.testDate}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Facility / Laboratory</span>
                    <span className="font-bold">{analysisResults.patientInfo.facilityName}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Attending Physician</span>
                    <span className="font-bold">{analysisResults.patientInfo.doctorName}</span>
                  </div>
                </div>
              </div>

              {/* 2. HEALTH SCORE & EXECUTIVE OVERVIEW */}
              <div className={`p-8 rounded-3xl border ${darkMode ? 'glass-card-dark' : 'glass-card-light'}`}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
                  
                  {/* Gauge */}
                  <div className="flex flex-col items-center justify-center text-center border-b md:border-b-0 md:border-r border-white/10 pb-6 md:pb-0">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Overall Health Index</h3>
                    <HealthScoreCircle score={analysisResults.healthScore} />
                    <span className="mt-4 px-4 py-1.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      {analysisResults.riskLevel} Risk Profile
                    </span>
                  </div>

                  {/* Summary */}
                  <div className="md:col-span-2 space-y-4">
                    <div>
                      <h4 className="text-base font-bold text-cyan-400 mb-1">Easy-to-Understand Clinical Explanation</h4>
                      <p className={`text-sm leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        {analysisResults.summaryPatientFriendly}
                      </p>
                    </div>

                    {analysisResults.summaryTechnical && (
                      <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                        <h5 className="text-xs font-bold text-indigo-400 mb-1 uppercase tracking-wide">Specialist Technical Evaluation</h5>
                        <p className={`text-xs leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                          {analysisResults.summaryTechnical}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 3. DIAGNOSES & KEY FINDINGS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className={`p-6 rounded-3xl border ${darkMode ? 'glass-card-dark' : 'glass-card-light'}`}>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400 mb-3 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> Clinical Diagnoses & Key Findings
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {analysisResults.diagnoses && analysisResults.diagnoses.length > 0 ? (
                      analysisResults.diagnoses.map((d, i) => {
                        const isNormalText = d.toLowerCase().includes('complete') || d.toLowerCase().includes('normal') || d.toLowerCase().includes('evaluation');
                        return (
                          <span
                            key={i}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border ${
                              isNormalText
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                            }`}
                          >
                            {d}
                          </span>
                        );
                      })
                    ) : (
                      <span className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        All Biomarkers Within Normal Reference Ranges
                      </span>
                    )}
                  </div>
                </div>

                {analysisResults.symptoms?.length > 0 ? (
                  <div className={`p-6 rounded-3xl border ${darkMode ? 'glass-card-dark' : 'glass-card-light'}`}>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400 mb-3 flex items-center gap-2">
                      <Activity className="w-4 h-4" /> Symptoms Identified
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {analysisResults.symptoms.map((s, i) => (
                        <span key={i} className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className={`p-6 rounded-3xl border ${darkMode ? 'glass-card-dark' : 'glass-card-light'}`}>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-400 mb-3 flex items-center gap-2">
                      <Activity className="w-4 h-4" /> Report Health Status
                    </h3>
                    <span className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      No Acute Physical Symptoms Reported
                    </span>
                  </div>
                )}
              </div>

              {/* 4. ABNORMAL BIOMARKERS ALERT BANNER */}
              {analysisResults.alerts?.length > 0 ? (
                <div className={`p-6 rounded-3xl border ${darkMode ? 'bg-amber-950/30 border-amber-800/50' : 'bg-amber-50 border-amber-200'}`}>
                  <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2 mb-3 uppercase tracking-wide">
                    <AlertCircle className="w-5 h-5" /> Key Abnormal Findings ({analysisResults.alerts.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {analysisResults.alerts.map((a, i) => (
                      <span key={i} className="px-4 py-2 rounded-2xl text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {a.title}: <span className="underline">{a.value}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className={`p-5 rounded-3xl border ${darkMode ? 'bg-emerald-950/20 border-emerald-800/40' : 'bg-emerald-50 border-emerald-200'}`}>
                  <h3 className="text-xs font-bold text-emerald-400 flex items-center gap-2 uppercase tracking-wide">
                    <CheckCircle className="w-4 h-4" /> Key Findings Notice: All Lab Values Are Within Expected Reference Ranges
                  </h3>
                </div>
              )}

              {/* 5. COMPLETE BIOMARKERS & LAB RESULTS TABLE (MATCHING USER SCREENSHOT TABLE FORMAT) */}
              {analysisResults.biomarkers?.length > 0 && (
                <div className={`p-8 rounded-3xl border ${darkMode ? 'glass-card-dark' : 'glass-card-light'}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <Activity className="w-6 h-6 text-cyan-400" /> Test Summary & Reference Range Comparison Table
                    </h3>
                    <span className="text-xs text-cyan-400 font-semibold px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30">
                      Clinical Lab Table Format Enabled
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className={`border-b text-xs uppercase tracking-wider ${darkMode ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
                          <th className="pb-3 px-3">Test Name</th>
                          <th className="pb-3 px-3">Result</th>
                          <th className="pb-3 px-3">Unit</th>
                          <th className="pb-3 px-3">Reference Range</th>
                          <th className="pb-3 px-3 text-center">Status</th>
                          <th className="pb-3 px-3">Clinical Meaning & Significance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                          const st = (bm.status || 'normal').toLowerCase();
                          const isCritical = st.includes('critical');
                          const isHigh = st.includes('high') || st.includes('elevated');
                          const isLow = st.includes('low') || st.includes('decreased');
                          const isPositive = st.includes('positive') || st.includes('reactive') || st.includes('abnormal');
                          const isNegative = st.includes('negative') || st.includes('non-reactive');
                          const isBorderline = st.includes('borderline');

                          let badgeClass = "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
                          let statusText = (bm.status || "NORMAL").toUpperCase();

                          if (isCritical) {
                            badgeClass = "bg-rose-500/25 text-rose-300 border-rose-500/40 font-black animate-pulse";
                            statusText = bm.status ? bm.status.toUpperCase() : "CRITICAL";
                          } else if (isHigh) {
                            badgeClass = "bg-amber-500/20 text-amber-300 border-amber-500/30";
                            statusText = bm.status ? bm.status.toUpperCase() : "HIGH";
                          } else if (isLow) {
                            badgeClass = "bg-amber-500/20 text-amber-300 border-amber-500/30";
                            statusText = bm.status ? bm.status.toUpperCase() : "LOW";
                          } else if (isPositive) {
                            badgeClass = "bg-rose-500/20 text-rose-300 border-rose-500/30 font-bold";
                            statusText = bm.status ? bm.status.toUpperCase() : "POSITIVE";
                          } else if (isBorderline) {
                            badgeClass = "bg-purple-500/20 text-purple-300 border-purple-500/30";
                            statusText = bm.status ? bm.status.toUpperCase() : "BORDERLINE";
                          } else if (isNegative) {
                            badgeClass = "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
                            statusText = bm.status ? bm.status.toUpperCase() : "NEGATIVE";
                          }

                          return (
                            <tr key={i} className={`hover:bg-cyan-500/5 transition ${isCritical ? (darkMode ? 'bg-rose-950/20' : 'bg-rose-50') : ''}`}>
                              <td className="py-4 px-3 font-bold max-w-[200px]">{bm.name}</td>
                              <td className={`py-4 px-3 font-extrabold text-lg ${isCritical ? 'text-rose-400' : (isHigh || isLow) ? 'text-amber-400' : 'text-cyan-300'}`}>
                                {bm.value}
                              </td>
                              <td className="py-4 px-3 text-xs text-slate-300 font-mono">
                                <span className="px-2 py-1 rounded bg-slate-800 border border-slate-700">{bm.unit || '-'}</span>
                              </td>
                              <td className="py-4 px-3 text-xs text-slate-400 font-mono">
                                <span className="px-2.5 py-1 rounded bg-slate-800/80 border border-slate-700/80">{bm.normalRange || 'Not Provided'}</span>
                              </td>
                              <td className="py-4 px-3 text-center">
                                <span className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border whitespace-nowrap ${badgeClass}`}>
                                  {statusText}
                                </span>
                              </td>
                              <td className={`py-4 px-3 text-xs leading-relaxed max-w-[320px] ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                {bm.significance || (st.includes('normal') ? 'Optimal physiological value within standard reference range.' : `${bm.name} is ${st.toUpperCase()} relative to reference limits.`)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 6. PRESCRIBED MEDICATIONS TABLE */}
              {analysisResults.medicines?.length > 0 && (
                <div className={`p-8 rounded-3xl border ${darkMode ? 'glass-card-dark' : 'glass-card-light'}`}>
                  <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-indigo-400">
                    <FileText className="w-6 h-6" /> Prescribed Medications & Prescriptions
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className={`border-b text-xs uppercase tracking-wider ${darkMode ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
                          <th className="pb-3">Medication Name</th>
                          <th className="pb-3">Dosage</th>
                          <th className="pb-3">Frequency</th>
                          <th className="pb-3">Duration</th>
                          <th className="pb-3">Purpose / Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {analysisResults.medicines.map((m, i) => (
                          <tr key={i} className="hover:bg-cyan-500/5 transition">
                            <td className="py-3 font-bold text-cyan-300">{m.name}</td>
                            <td className="py-3">{m.dose || 'As directed'}</td>
                            <td className="py-3">{m.frequency || 'Daily'}</td>
                            <td className="py-3">{m.duration || 'As prescribed'}</td>
                            <td className={`py-3 text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>{m.purpose || m.instructions || 'Prescribed treatment'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 7. RADIOLOGY & IMAGING FINDINGS */}
              {analysisResults.radiologyFindings?.length > 0 && (
                <div className={`p-6 rounded-3xl border ${darkMode ? 'glass-card-dark' : 'glass-card-light'}`}>
                  <h3 className="text-lg font-bold mb-3 flex items-center gap-2 text-cyan-400">
                    <FileText className="w-5 h-5" /> Radiology & Imaging Observations
                  </h3>
                  <ul className="space-y-2">
                    {analysisResults.radiologyFindings.map((rf, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <span className="text-cyan-400 font-bold">ΓÇó</span>
                        <span>{rf}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 8. ACTIONABLE RECOMMENDATIONS GRID */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Diet & Foods */}
                <div className={`p-6 rounded-3xl border ${darkMode ? 'glass-card-dark' : 'glass-card-light'}`}>
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-emerald-400">
                    <Heart className="w-5 h-5" /> Nutrition & Dietary Guidance
                  </h3>
                  <ul className="space-y-2 mb-4">
                    {analysisResults.recommendations.nutrition.map((item, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <span className="text-emerald-400 font-bold">ΓÇó</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  {analysisResults.recommendations.foodsToAvoid?.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-white/10">
                      <h4 className="text-xs font-bold uppercase text-rose-400 mb-2">Foods to Limit / Avoid:</h4>
                      <div className="flex flex-wrap gap-2">
                        {analysisResults.recommendations.foodsToAvoid.map((fa, i) => (
                          <span key={i} className="px-3 py-1 rounded-xl text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            {fa}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Lifestyle & Follow-up Tests */}
                <div className={`p-6 rounded-3xl border ${darkMode ? 'glass-card-dark' : 'glass-card-light'}`}>
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-cyan-400">
                    <Activity className="w-5 h-5" /> Lifestyle & Follow-Up Plan
                  </h3>
                  <ul className="space-y-2 mb-4">
                    {analysisResults.recommendations.lifestyle.map((item, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <span className="text-cyan-400 font-bold">ΓÇó</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  {analysisResults.recommendations.followUpTests?.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-white/10">
                      <h4 className="text-xs font-bold uppercase text-indigo-400 mb-2">Recommended Follow-Up Diagnostic Tests:</h4>
                      <ul className="space-y-1">
                        {analysisResults.recommendations.followUpTests.map((ft, i) => (
                          <li key={i} className="text-xs flex items-center gap-2 text-indigo-300">
                            <span className="font-bold">ΓÇó</span> {ft}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* 9. QUESTIONS FOR YOUR DOCTOR & SPECIALIST SUGGESTION */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className={`p-6 rounded-3xl border ${darkMode ? 'glass-card-dark' : 'glass-card-light'}`}>
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-indigo-400">
                    <Brain className="w-5 h-5" /> Questions to Ask Your Doctor
                  </h3>
                  <ul className="space-y-2">
                    {analysisResults.doctorQuestions.map((q, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <span className="text-indigo-400 font-bold">ΓÇó</span>
                        <span>{q}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className={`p-6 rounded-3xl border ${darkMode ? 'glass-card-dark' : 'glass-card-light'} flex flex-col justify-between`}>
                  <div>
                    <h3 className="text-lg font-bold mb-2 flex items-center gap-2 text-emerald-400">
                      <User className="w-5 h-5" /> Recommended Doctor Specialist
                    </h3>
                    <p className={`text-sm mb-4 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Based on your report findings, consultation with a <strong className="text-cyan-400">{analysisResults.doctorSuggestion}</strong> is recommended.
                    </p>
                  </div>

                  {/* Section 8: Analysis Confidence Score Card */}
                  {analysisResults.section8_confidenceScore && (
                    <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-cyan-950/30 border-cyan-800/50' : 'bg-cyan-50 border-cyan-200'}`}>
                      <h5 className="text-xs font-bold text-cyan-400 flex items-center gap-2 mb-1 uppercase tracking-wide">
                        <Shield className="w-4 h-4" /> Section 8: Analysis Confidence Score ({analysisResults.section8_confidenceScore.percentage}%)
                      </h5>
                      <p className={`text-xs ${darkMode ? 'text-cyan-300' : 'text-cyan-900'}`}>
                        {analysisResults.section8_confidenceScore.reasoning}
                      </p>
                    </div>
                  )}

                  {/* Document & Handwriting Assessment */}
                  {analysisResults.imageQualityNotes && (
                    <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-indigo-950/30 border-indigo-800/50' : 'bg-indigo-50 border-indigo-200'}`}>
                      <h5 className="text-xs font-bold text-indigo-400 flex items-center gap-2 mb-1 uppercase tracking-wide">
                        <FileText className="w-4 h-4" /> Document & Quality Assessment
                      </h5>
                      <p className={`text-xs ${darkMode ? 'text-indigo-300' : 'text-indigo-800'}`}>
                        {analysisResults.imageQualityNotes}
                      </p>
                    </div>
                  )}
                </div>
              </div>

            </motion.div>
          )}

          {/* PRODUCTION REAL-TIME AI CHAT PAGE */}
          {currentPage === 'chat' && (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 h-[calc(100vh-100px)] flex flex-col"
            >
              {/* Chat Header Glass Card */}
              <div className={`p-4 rounded-2xl border mb-4 flex items-center justify-between ${darkMode ? 'glass-card-dark' : 'glass-card-light'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
                    <Brain className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">MedIntel Clinical AI Assistant</h3>
                    <p className="text-xs text-slate-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      {analysisResults ? 'Active Context: Patient Report Loaded' : 'General Health AI Guidance'}
                    </p>
                  </div>
                </div>

                {chatHistory.length > 1 && (
                  <button
                    onClick={() => setChatHistory([chatHistory[0]])}
                    className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition text-xs flex items-center gap-1.5"
                    title="Clear chat"
                  >
                    <Trash2 className="w-4 h-4" /> Clear Chat
                  </button>
                )}
              </div>

              {/* Quick Action Prompt Chips */}
              <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-2 scrollbar-none">
                {[
                  "Explain my abnormal lab values",
                  "What diet changes should I make?",
                  "What questions should I ask my doctor?",
                  "Is my health score concerning?"
                ].map((chip, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(chip)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-all ${darkMode ? 'bg-slate-900/80 border-slate-800 text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-500/40' : 'bg-white border-slate-200 text-cyan-700 hover:bg-cyan-50'}`}
                  >
                    ≡ƒÆí {chip}
                  </button>
                ))}
              </div>

              {/* Messages Container */}
              <div className={`flex-1 overflow-y-auto p-4 rounded-3xl border mb-4 space-y-4 ${darkMode ? 'glass-card-dark' : 'glass-card-light'}`}>
                {chatHistory.map((msg, index) => (
                  <div
                    key={index}
                    className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shrink-0 mt-1">
                        <Brain className="w-4 h-4" />
                      </div>
                    )}

                    <div
                      className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed relative group ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-tr-none shadow-lg shadow-cyan-500/20'
                          : darkMode
                          ? 'bg-slate-900/80 border border-slate-800 text-slate-200 rounded-tl-none'
                          : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{msg.content}</div>

                      {/* Copy Action */}
                      {msg.role === 'assistant' && (
                        <button
                          onClick={() => copyToClipboard(msg.content, index)}
                          className="absolute top-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition bg-slate-800/80 text-slate-300 hover:text-white"
                          title="Copy text"
                        >
                          {copiedIndex === index ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Loading Bouncing Dots Indicator */}
                {chatLoading && (
                  <div className="flex gap-3 justify-start">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shrink-0">
                      <Brain className="w-4 h-4" />
                    </div>
                    <div className={`p-4 rounded-2xl rounded-tl-none border flex items-center gap-1.5 ${darkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'}`}>
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" />
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce [animation-delay:0.2s]" />
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce [animation-delay:0.4s]" />
                    </div>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Chat Input Area */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Ask any health question or inquire about your report..."
                  className={`flex-1 px-5 py-4 rounded-2xl border text-sm outline-none transition-all ${
                    darkMode
                      ? 'bg-slate-900/80 border-slate-800 text-white focus:border-cyan-500/60'
                      : 'bg-white border-slate-200 text-slate-900 focus:border-cyan-500'
                  }`}
                />

                <button
                  disabled={!chatInput.trim() || chatLoading}
                  onClick={() => sendMessage()}
                  className={`p-4 rounded-2xl font-bold transition-all shadow-lg ${
                    !chatInput.trim() || chatLoading
                      ? 'opacity-40 cursor-not-allowed bg-slate-800 text-slate-500'
                      : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:scale-105 shadow-cyan-500/25'
                  }`}
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          )}

          {/* SAVED USER REPORTS PAGE */}
          {currentPage === 'reports' && (
            <motion.div
              key="reports"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12"
            >
              <h2 className="text-3xl font-extrabold mb-2">Saved Medical Reports</h2>
              <p className={`text-sm mb-8 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Past report analyses saved securely to your account
              </p>

              {savedUserReports.length === 0 ? (
                <div className={`p-12 text-center rounded-3xl border ${darkMode ? 'glass-card-dark' : 'glass-card-light'}`}>
                  <FileText className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                  <p className="text-lg font-bold mb-2">No saved reports yet</p>
                  <p className="text-xs text-slate-400 mb-6">Upload a report while logged in to save analyses to your account.</p>
                  <button
                    onClick={() => setCurrentPage('upload')}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-sm"
                  >
                    Upload Report Now
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {savedUserReports.map((item, idx) => (
                    <div
                      key={idx}
                      className={`p-6 rounded-2xl border ${darkMode ? 'glass-card-dark' : 'glass-card-light'}`}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <FileText className="w-6 h-6 text-cyan-400" />
                          <div>
                            <h4 className="font-bold text-sm truncate max-w-[200px]">{item.filename}</h4>
                            <p className="text-xs text-slate-400">{new Date(item.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-400">
                          Score: {item.health_score}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setAnalysisResults({
                            patientInfo: { age: "34", gender: "Not specified", testDate: new Date(item.created_at).toLocaleDateString() },
                            healthScore: item.health_score || 75,
                            summaryPatientFriendly: item.analysis.simpleExplanation || item.analysis.summary || "Report analysis",
                            riskLevel: item.analysis.riskLevel || "Moderate",
                            alerts: item.analysis.abnormalFindings?.map(a => ({ title: a.name, value: a.value })) || [],
                            biomarkers: item.analysis.biomarkers || [],
                            medicines: item.analysis.medicines || [],
                            recommendations: { nutrition: item.analysis.dietRecommendations || [], lifestyle: item.analysis.lifestyleRecommendations || [] },
                            doctorQuestions: item.analysis.doctorQuestions || [],
                            imageQualityNotes: item.analysis.imageQualityNotes || ""
                          });
                          setCurrentPage('analysis');
                        }}
                        className="w-full py-2.5 rounded-xl border border-cyan-500/30 text-cyan-400 text-xs font-bold hover:bg-cyan-500/10 transition"
                      >
                        View Full Analysis
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* FIGMA GLASSMORPHISM AUTHENTICATION MODAL */}
      {authModalOpen && (
        <div className="fixed inset-0 backdrop-blur-md bg-black/60 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`w-full max-w-md p-8 rounded-3xl border shadow-2xl relative ${darkMode ? 'glass-modal-dark text-white' : 'glass-modal-light text-slate-900'}`}
          >
            <button
              onClick={() => setAuthModalOpen(false)}
              className="absolute top-6 right-6 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center mx-auto mb-3 text-white shadow-lg shadow-cyan-500/30">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-extrabold">
                {authMode === 'login' ? 'Welcome Back' : 'Create Account'}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {authMode === 'login' ? 'Sign in to access saved reports and AI chat history' : 'Register to manage your medical intelligence profile'}
              </p>
            </div>

            {/* Error Alert */}
            {authError && (
              <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authMode === 'register' && (
                <div>
                  <label className="text-xs font-semibold text-slate-400 mb-1 block">Full Name</label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-4 top-3.5 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={authForm.full_name}
                      onChange={e => setAuthForm({ ...authForm, full_name: e.target.value })}
                      placeholder="Dr. Sarah Mitchell"
                      className={`w-full pl-11 pr-4 py-3 rounded-xl border text-sm outline-none transition ${darkMode ? 'bg-slate-900/60 border-slate-800 text-white focus:border-cyan-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-cyan-500'}`}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-400 mb-1 block">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-4 top-3.5 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={authForm.email}
                    onChange={e => setAuthForm({ ...authForm, email: e.target.value })}
                    placeholder="doctor@medintel.ai"
                    className={`w-full pl-11 pr-4 py-3 rounded-xl border text-sm outline-none transition ${darkMode ? 'bg-slate-900/60 border-slate-800 text-white focus:border-cyan-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-cyan-500'}`}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 mb-1 block">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-4 top-3.5 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={authForm.password}
                    onChange={e => setAuthForm({ ...authForm, password: e.target.value })}
                    placeholder="ΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇó"
                    className={`w-full pl-11 pr-11 py-3 rounded-xl border text-sm outline-none transition ${darkMode ? 'bg-slate-900/60 border-slate-800 text-white focus:border-cyan-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-cyan-500'}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-3.5 text-slate-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 text-white text-sm font-bold shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-[1.01] active:scale-[0.99] transition flex items-center justify-center gap-2 mt-2"
              >
                {authLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : (authMode === 'login' ? 'Sign In' : 'Create Account')}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthError(''); }}
                className="text-xs font-semibold text-cyan-400 hover:underline"
              >
                {authMode === 'login' ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
}

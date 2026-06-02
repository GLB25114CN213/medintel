import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, Send, TrendingUp, AlertCircle, Heart, Brain, Shield, Zap, ChevronDown,
  Menu, X, Plus, Trash2, Download, Eye, EyeOff, ArrowRight, BarChart3, Activity,
  FileText, CheckCircle, Clock, Home, Settings, LogOut, Bell, Search, Calendar
} from 'lucide-react';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, RadarChart, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Radar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';

export default function MedIntelAI() {
  // Auth States
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // login, register
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [userName, setUserName] = useState('');

  // Main App States
  const [currentPage, setCurrentPage] = useState('home'); // home, dashboard, upload, analysis, chat
  const [darkMode, setDarkMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [reports, setReports] = useState([]);
  const [analysisResults, setAnalysisResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [selectedReport, setSelectedReport] = useState(null);
  const fileInputRef = useRef(null);

  // Handle Login
  const handleLogin = () => {
    if (loginEmail && loginPassword) {
      setIsAuthenticated(true);
      setUserName(loginEmail.split('@')[0]);
      setLoginEmail('');
      setLoginPassword('');
      setCurrentPage('dashboard');
    }
  };

  // Handle Register
  const handleRegister = () => {
    if (loginEmail && loginPassword && userName) {
      setIsAuthenticated(true);
      setLoginEmail('');
      setLoginPassword('');
      setCurrentPage('dashboard');
    }
  };

  // File Upload Handler
  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    const newReports = files.map(f => ({
      id: Date.now() + Math.random(),
      file: f,
      name: f.name,
      type: f.type,
      size: f.size,
      uploadDate: new Date(),
      status: 'uploaded'
    }));
    setReports([...reports, ...newReports]);
  };

  // Analyze Reports with Simulated Data
  const handleAnalyze = async () => {
    if (reports.length === 0) return;
    setLoading(true);
    
    // Simulate API call with timeout
    setTimeout(() => {
      const mockAnalysis = {
        patientInfo: {
          age: '45-55',
          gender: 'Not specified',
          testDate: new Date().toLocaleDateString()
        },
        biomarkers: [
          { name: 'Hemoglobin', value: 13.2, unit: 'g/dL', normalRange: '13.5-17.5', status: 'low', significance: 'May indicate mild anemia or nutritional deficiency', recommendation: 'Increase iron intake through diet or supplements' },
          { name: 'Vitamin D', value: 18, unit: 'ng/mL', normalRange: '30-100', status: 'low', significance: 'Deficiency affects bone health and immunity', recommendation: 'Increase sun exposure and vitamin D intake' },
          { name: 'LDL Cholesterol', value: 145, unit: 'mg/dL', normalRange: '<100', status: 'high', significance: 'Elevated cardiovascular risk', recommendation: 'Reduce saturated fats and increase exercise' },
          { name: 'HDL Cholesterol', value: 42, unit: 'mg/dL', normalRange: '>40', status: 'borderline', significance: 'Could be higher for better heart health', recommendation: 'Increase aerobic exercise' },
          { name: 'Blood Glucose', value: 95, unit: 'mg/dL', normalRange: '70-100', status: 'normal', significance: 'Within normal fasting range', recommendation: 'Maintain current lifestyle' },
          { name: 'Triglycerides', value: 120, unit: 'mg/dL', normalRange: '<150', status: 'normal', significance: 'Good fat metabolism', recommendation: 'Continue healthy diet' }
        ],
        healthScore: 62,
        riskLevel: 'moderate',
        summaryPatientFriendly: 'Your overall health is good, but there are a few areas needing attention. Your vitamin D is low, which can affect your bones and immunity. Your cholesterol is slightly elevated. These are manageable through diet and lifestyle changes.',
        summaryTechnical: 'Mild anemia detected. Vitamin D deficiency present. LDL cholesterol elevated with borderline HDL. Glucose metabolism normal. Metabolic health generally good.',
        alerts: [
          { title: 'Vitamin D Deficiency', severity: 'warning', value: '18 ng/mL' },
          { title: 'LDL Cholesterol Elevated', severity: 'warning', value: '145 mg/dL' },
          { title: 'Hemoglobin Low', severity: 'warning', value: '13.2 g/dL' }
        ],
        recommendations: {
          lifestyle: [
            '30 minutes of moderate exercise daily',
            '7-8 hours of quality sleep each night',
            'Stress management through meditation or yoga',
            'Limit processed and fried foods'
          ],
          nutrition: [
            'Iron-rich foods: spinach, lentils, red meat, pumpkin seeds',
            'Vitamin D sources: fatty fish, egg yolks, fortified milk',
            'Reduce saturated fats: limit butter and full-fat dairy',
            'Increase fiber: whole grains, beans, vegetables'
          ],
          supplements: [
            'Vitamin D3: 1000-2000 IU daily',
            'Iron supplement if anemia confirmed',
            'Omega-3 supplements for cholesterol'
          ],
          followUpTests: [
            'Repeat Vitamin D test in 3 months',
            'Lipid panel in 6-8 weeks',
            'Complete blood count in 6 months',
            'Fasting glucose test in 3 months'
          ]
        },
        doctorQuestions: [
          'Should I take Vitamin D supplements? If so, what dosage?',
          'What specific dietary changes would help lower my cholesterol?',
          'Is my low hemoglobin concerning or due to dietary deficiency?',
          'Do I need any medications at this time?',
          'How often should I get these tests repeated?'
        ],
        trendData: [
          { date: 'Jan', hemoglobin: 12.8, glucose: 98, ldl: 150, vitaminD: 15 },
          { date: 'Feb', hemoglobin: 13.0, glucose: 96, ldl: 148, vitaminD: 17 },
          { date: 'Mar', hemoglobin: 13.2, glucose: 95, ldl: 145, vitaminD: 18 },
          { date: 'Apr', hemoglobin: 13.5, glucose: 93, ldl: 142, vitaminD: 20 }
        ],
        healthScoreTrend: [
          { month: 'Jan', score: 58 },
          { month: 'Feb', score: 60 },
          { month: 'Mar', score: 62 },
          { month: 'Apr', score: 65 }
        ]
      };
      setAnalysisResults(mockAnalysis);
      setCurrentPage('analysis');
      setLoading(false);
    }, 2000);
  };

  // Chat Handler
  const sendMessage = () => {
    if (!chatInput.trim()) return;

    const newHistory = [...chatHistory, { role: 'user', content: chatInput }];
    setChatHistory(newHistory);
    setChatInput('');

    // Simulate AI response
    setTimeout(() => {
      const responses = [
        `Based on your reports, your ${chatInput.toLowerCase()} is being analyzed. Please ensure you're following the recommended lifestyle changes.`,
        `That's a great question about your health! The key thing to remember is that small consistent changes lead to big improvements over time.`,
        `Your recent results show ${analysisResults?.alerts?.[0]?.title || 'some areas'} that need attention. I'd recommend discussing this with your doctor.`,
        `Keep in mind that these are preliminary insights. Always consult with a healthcare professional for medical decisions.`
      ];
      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      setChatHistory([...newHistory, { role: 'assistant', content: randomResponse }]);
    }, 500);
  };

  const removeReport = (id) => {
    setReports(reports.filter(r => r.id !== id));
  };

  // UI Components
  const StatusBadge = ({ status }) => {
    const config = {
      normal: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', label: '✓ Normal' },
      low: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', label: '↓ Low' },
      borderline: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', label: '⚠ Borderline' },
      high: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400', label: '↑ High' },
      critical: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: '✕ Critical' }
    };
    const c = config[status] || config.normal;
    return <span className={`px-3 py-1 rounded-full text-sm font-semibold ${c.bg} ${c.text}`}>{c.label}</span>;
  };

  const HealthScoreCircle = ({ score }) => {
    const circumference = 2 * Math.PI * 45;
    const progress = (score / 100) * circumference;
    const color = score > 75 ? '#10b981' : score > 50 ? '#f59e0b' : '#ef4444';

    return (
      <div className="flex flex-col items-center">
        <div className="relative w-40 h-40">
          <svg className="absolute inset-0 transform -rotate-90 w-full h-full" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="3" fill="none" className="text-gray-300 dark:text-gray-600" />
            <motion.circle
              cx="50" cy="50" r="45" stroke={color} strokeWidth="3" fill="none"
              strokeDasharray={circumference} strokeDashoffset={circumference}
              animate={{ strokeDashoffset: circumference - progress }}
              transition={{ duration: 1.5 }}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <motion.div className="text-5xl font-bold" style={{ color }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                {score}
              </motion.div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Health Score</div>
            </div>
          </div>
        </div>
        <p className="mt-4 text-sm font-medium text-gray-700 dark:text-gray-300">
          {score > 75 ? '✓ Excellent' : score > 50 ? '⚠ Moderate' : '✕ Needs Attention'}
        </p>
      </div>
    );
  };

  // ==================== PAGES ====================

  // LOGIN/REGISTER PAGE
  if (!isAuthenticated) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-gradient-to-br from-slate-950 to-slate-900' : 'bg-gradient-to-br from-blue-50 to-cyan-50'}`}>
        <div className="absolute top-4 right-4">
          <button onClick={() => setDarkMode(!darkMode)} className={`p-2 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>

        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className={`w-full max-w-md p-8 rounded-2xl shadow-xl ${darkMode ? 'bg-slate-900' : 'bg-white'} border ${darkMode ? 'border-slate-800' : 'border-gray-200'}`}>
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
              <Heart className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-600">
              MedIntel AI
            </h1>
            <p className={`mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              AI-Powered Medical Report Analysis
            </p>
          </div>

          <div className="space-y-6">
            {authMode === 'login' ? (
              <>
                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Email</label>
                  <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="your@email.com" className={`w-full px-4 py-3 rounded-lg border outline-none transition ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'}`} />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Password</label>
                  <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="••••••••" className={`w-full px-4 py-3 rounded-lg border outline-none transition ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'}`} />
                </div>
                <button onClick={handleLogin} className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold py-3 rounded-lg hover:shadow-lg transition">
                  Log In
                </button>
              </>
            ) : (
              <>
                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Full Name</label>
                  <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="John Doe" className={`w-full px-4 py-3 rounded-lg border outline-none transition ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'}`} />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Email</label>
                  <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="your@email.com" className={`w-full px-4 py-3 rounded-lg border outline-none transition ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'}`} />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Password</label>
                  <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="••••••••" className={`w-full px-4 py-3 rounded-lg border outline-none transition ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'}`} />
                </div>
                <button onClick={handleRegister} className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold py-3 rounded-lg hover:shadow-lg transition">
                  Create Account
                </button>
              </>
            )}

            <p className={`text-center text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              {authMode === 'login' ? (
                <>Don't have an account? <button onClick={() => setAuthMode('register')} className="text-blue-500 font-medium hover:text-blue-600">Sign up</button></>
              ) : (
                <>Already have an account? <button onClick={() => setAuthMode('login')} className="text-blue-500 font-medium hover:text-blue-600">Log in</button></>
              )}
            </p>
          </div>

          <div className={`mt-6 p-4 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-blue-50'} border ${darkMode ? 'border-slate-700' : 'border-blue-200'}`}>
            <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              <strong>Demo credentials:</strong> Any email + password works for testing.
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  // MAIN APP LAYOUT
  return (
    <div className={`min-h-screen flex flex-col transition-colors ${darkMode ? 'bg-slate-950 text-white' : 'bg-gray-50 text-gray-900'}`}>
      {/* Header */}
      <header className={`sticky top-0 z-40 border-b backdrop-blur-md ${darkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-white/80 border-gray-200'}`}>
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className={`p-2 rounded-lg lg:hidden ${darkMode ? 'hover:bg-slate-800' : 'hover:bg-gray-100'}`}>
              {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                <Heart className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                MedIntel AI
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button onClick={() => setDarkMode(!darkMode)} className={`p-2 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
              {darkMode ? '☀️' : '🌙'}
            </button>
            <button onClick={() => { setIsAuthenticated(false); setCurrentPage('home'); }} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-slate-800' : 'hover:bg-gray-100'}`}>
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen && (
          <aside className={`w-64 border-r ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} p-6 overflow-y-auto hidden lg:block`}>
            <nav className="space-y-2">
              {[
                { id: 'dashboard', label: 'Dashboard', icon: Home },
                { id: 'upload', label: 'Upload Reports', icon: Upload },
                { id: 'analysis', label: 'Analysis', icon: BarChart3, disabled: !analysisResults },
                { id: 'chat', label: 'AI Chat', icon: Brain, disabled: !analysisResults }
              ].map(item => (
                <button
                  key={item.id}
                  onClick={() => setCurrentPage(item.id)}
                  disabled={item.disabled}
                  className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition ${
                    currentPage === item.id
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                      : `${darkMode ? 'text-gray-300 hover:bg-slate-800' : 'text-gray-700 hover:bg-gray-100'} ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </button>
              ))}
            </nav>
            {analysisResults && (
              <div className={`mt-8 p-4 rounded-lg border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-blue-50 border-blue-200'}`}>
                <p className={`text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Last Analysis</p>
                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  {analysisResults.patientInfo.testDate}
                </p>
              </div>
            )}
          </aside>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {/* DASHBOARD PAGE */}
            {currentPage === 'dashboard' && (
              <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4 lg:p-8 max-w-7xl mx-auto w-full">
                <div className="mb-8">
                  <h2 className="text-4xl font-bold mb-2">Welcome, {userName}!</h2>
                  <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Your health dashboard and medical report center</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={`p-6 rounded-xl border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold">Reports</h3>
                      <FileText className="w-5 h-5 text-blue-500" />
                    </div>
                    <p className="text-3xl font-bold">{reports.length}</p>
                    <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Uploaded</p>
                  </motion.div>

                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={`p-6 rounded-xl border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold">Status</h3>
                      <CheckCircle className="w-5 h-5 text-emerald-500" />
                    </div>
                    <p className="text-3xl font-bold">{analysisResults ? '1' : '0'}</p>
                    <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Analyzed</p>
                  </motion.div>

                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className={`p-6 rounded-xl border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold">Health Score</h3>
                      <Heart className="w-5 h-5 text-red-500" />
                    </div>
                    <p className="text-3xl font-bold">{analysisResults?.healthScore || '—'}</p>
                    <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{analysisResults?.riskLevel || 'No data'}</p>
                  </motion.div>

                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className={`p-6 rounded-xl border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold">Last Update</h3>
                      <Calendar className="w-5 h-5 text-purple-500" />
                    </div>
                    <p className="text-lg font-bold">{analysisResults?.patientInfo.testDate || 'Pending'}</p>
                    <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Test date</p>
                  </motion.div>
                </div>

                {analysisResults && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={`p-6 rounded-xl border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
                      <h3 className="font-bold text-lg mb-4">Health Trends</h3>
                      <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={analysisResults.trendData}>
                          <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#475569' : '#e5e7eb'} />
                          <XAxis dataKey="date" stroke={darkMode ? '#9ca3af' : '#6b7280'} />
                          <YAxis stroke={darkMode ? '#9ca3af' : '#6b7280'} />
                          <Tooltip contentStyle={{ backgroundColor: darkMode ? '#1e293b' : '#fff', border: 'none', borderRadius: '8px' }} />
                          <Legend />
                          <Line type="monotone" dataKey="hemoglobin" stroke="#3b82f6" strokeWidth={2} />
                          <Line type="monotone" dataKey="glucose" stroke="#f59e0b" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    </motion.div>

                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={`p-6 rounded-xl border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
                      <h3 className="font-bold text-lg mb-4">Score Progress</h3>
                      <ResponsiveContainer width="100%" height={250}>
                        <AreaChart data={analysisResults.healthScoreTrend}>
                          <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#475569' : '#e5e7eb'} />
                          <XAxis dataKey="month" stroke={darkMode ? '#9ca3af' : '#6b7280'} />
                          <YAxis stroke={darkMode ? '#9ca3af' : '#6b7280'} />
                          <Tooltip contentStyle={{ backgroundColor: darkMode ? '#1e293b' : '#fff', border: 'none', borderRadius: '8px' }} />
                          <Area type="monotone" dataKey="score" stroke="#06b6d4" fill="#06b6d420" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </motion.div>
                  </div>
                )}

                {!analysisResults && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`text-center p-12 rounded-xl border-2 border-dashed ${darkMode ? 'border-slate-800 bg-slate-900/50' : 'border-gray-300 bg-gray-50'}`}>
                    <Brain className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <h3 className="text-xl font-semibold mb-2">No Analysis Yet</h3>
                    <p className={`mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Upload and analyze reports to see your health insights</p>
                    <button onClick={() => setCurrentPage('upload')} className="inline-flex items-center gap-2 px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                      <Upload className="w-4 h-4" /> Get Started
                    </button>
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* UPLOAD PAGE */}
            {currentPage === 'upload' && (
              <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4 lg:p-8 max-w-4xl mx-auto w-full">
                <div className="mb-8">
                  <h2 className="text-4xl font-bold mb-2">Upload Medical Reports</h2>
                  <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>PDF, images, scans - any medical document</p>
                </div>

                <div onClick={() => fileInputRef.current?.click()} className={`border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition mb-8 ${darkMode ? 'border-slate-700 hover:bg-slate-800' : 'border-blue-300 hover:bg-blue-50'}`}>
                  <Upload className="w-20 h-20 mx-auto mb-4 text-blue-500 opacity-50" />
                  <h3 className="text-2xl font-bold mb-2">Drag files or click to browse</h3>
                  <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>PDF, JPG, PNG • Up to 10MB each</p>
                  <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileUpload} className="hidden" />
                </div>

                {reports.length > 0 && (
                  <div>
                    <h3 className="text-lg font-bold mb-4">Uploaded Files ({reports.length})</h3>
                    <div className="space-y-3 mb-8">
                      {reports.map(report => (
                        <motion.div key={report.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex items-center justify-between p-4 rounded-lg border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                          <div className="flex items-center gap-4 flex-1">
                            <Upload className="w-5 h-5 text-blue-500" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{report.name}</p>
                              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{(report.size / 1024).toFixed(1)} KB</p>
                            </div>
                          </div>
                          <button onClick={() => removeReport(report.id)} className={`p-2 rounded ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-100'}`}>
                            <Trash2 className="w-5 h-5 text-red-500" />
                          </button>
                        </motion.div>
                      ))}
                    </div>

                    <button onClick={handleAnalyze} disabled={loading} className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold py-4 rounded-lg hover:shadow-lg disabled:opacity-50 transition flex items-center justify-center gap-2">
                      {loading ? (
                        <>
                          <div className="animate-spin">⟳</div> Analyzing...
                        </>
                      ) : (
                        <>
                          <Zap className="w-5 h-5" /> Analyze with AI
                        </>
                      )}
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {/* ANALYSIS PAGE */}
            {currentPage === 'analysis' && analysisResults && (
              <motion.div key="analysis" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4 lg:p-8 max-w-6xl mx-auto w-full">
                <div className="mb-8">
                  <h2 className="text-4xl font-bold mb-2">Your Health Analysis</h2>
                  <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>AI-powered insights and recommendations</p>
                </div>

                {/* Health Score */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={`p-8 rounded-2xl border mb-8 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
                  <h3 className="text-2xl font-bold mb-8">Overall Health Score</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="flex justify-center">
                      <HealthScoreCircle score={analysisResults.healthScore} />
                    </div>
                    <div className="space-y-6">
                      <div>
                        <h4 className="font-bold mb-2 text-lg">Summary</h4>
                        <p className={darkMode ? 'text-gray-300' : 'text-gray-700'}>{analysisResults.summaryPatientFriendly}</p>
                      </div>
                      {analysisResults.alerts?.length > 0 && (
                        <div className={`p-4 rounded-lg border ${darkMode ? 'bg-amber-900/20 border-amber-800' : 'bg-amber-50 border-amber-200'}`}>
                          <h5 className={`font-bold mb-3 flex items-center gap-2 ${darkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                            <AlertCircle className="w-5 h-5" /> Key Alerts
                          </h5>
                          <ul className="space-y-2">
                            {analysisResults.alerts.map((alert, i) => (
                              <li key={i} className={`text-sm ${darkMode ? 'text-amber-300' : 'text-amber-800'}`}>
                                • <strong>{alert.title}</strong> ({alert.value})
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>

                {/* Biomarkers */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={`p-8 rounded-2xl border mb-8 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
                  <h3 className="text-2xl font-bold mb-6">Detailed Biomarkers</h3>
                  <div className="space-y-4">
                    {analysisResults.biomarkers.map((bm, i) => (
                      <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className={`p-5 rounded-lg border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-200'}`}>
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h4 className="font-bold text-lg">{bm.name}</h4>
                            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Normal: {bm.normalRange}</p>
                          </div>
                          <StatusBadge status={bm.status} />
                        </div>
                        <div className="grid grid-cols-3 gap-4 mb-3">
                          <div>
                            <div className="text-3xl font-bold text-blue-600">{bm.value}</div>
                            <div className="text-xs text-gray-500">{bm.unit}</div>
                          </div>
                          <div className="col-span-2 text-sm">{bm.significance}</div>
                        </div>
                        <div className={`p-3 rounded text-sm ${darkMode ? 'bg-blue-900/20 text-blue-300' : 'bg-blue-50 text-blue-900'}`}>
                          💡 {bm.recommendation}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>

                {/* Recommendations Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className={`p-6 rounded-2xl border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
                    <h4 className="font-bold text-lg mb-4 flex items-center gap-2">
                      <Zap className="w-5 h-5 text-amber-500" /> Lifestyle
                    </h4>
                    <ul className="space-y-3">
                      {analysisResults.recommendations.lifestyle.map((item, i) => (
                        <li key={i} className={`flex gap-2 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          <span className="text-amber-500">✓</span> {item}
                        </li>
                      ))}
                    </ul>
                  </motion.div>

                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className={`p-6 rounded-2xl border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
                    <h4 className="font-bold text-lg mb-4 flex items-center gap-2">
                      <Heart className="w-5 h-5 text-red-500" /> Nutrition
                    </h4>
                    <ul className="space-y-3">
                      {analysisResults.recommendations.nutrition.map((item, i) => (
                        <li key={i} className={`flex gap-2 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          <span className="text-red-500">•</span> {item}
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                </div>

                {/* Doctor Questions */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className={`p-6 rounded-2xl border mb-8 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
                  <h4 className="font-bold text-lg mb-4 flex items-center gap-2">
                    <Brain className="w-5 h-5 text-purple-500" /> Questions for Your Doctor
                  </h4>
                  <ul className="space-y-3">
                    {analysisResults.doctorQuestions.map((q, i) => (
                      <li key={i} className={`flex gap-3 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        <span className="text-purple-500 font-bold">{i + 1}.</span> {q}
                      </li>
                    ))}
                  </ul>
                </motion.div>

                {/* Follow-up Tests */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className={`p-6 rounded-2xl border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
                  <h4 className="font-bold text-lg mb-4 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-cyan-500" /> Follow-up Tests
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {analysisResults.recommendations.followUpTests.map((test, i) => (
                      <div key={i} className={`p-3 rounded-lg text-sm ${darkMode ? 'bg-cyan-900/20 text-cyan-300' : 'bg-cyan-50 text-cyan-700'} border ${darkMode ? 'border-cyan-800' : 'border-cyan-200'}`}>
                        📋 {test}
                      </div>
                    ))}
                  </div>
                </motion.div>
              </motion.div>
            )}

            {/* CHAT PAGE */}
            {currentPage === 'chat' && analysisResults && (
              <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4 lg:p-8 h-[calc(100vh-120px)] flex flex-col max-w-2xl mx-auto w-full">
                <div className="mb-6">
                  <h2 className="text-4xl font-bold mb-2">Medical AI Assistant</h2>
                  <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Ask questions about your health and reports</p>
                </div>

                <div className={`flex-1 overflow-y-auto mb-6 rounded-xl border p-6 space-y-4 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
                  {chatHistory.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-center">
                      <div>
                        <Brain className="w-20 h-20 mx-auto mb-4 opacity-20" />
                        <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Start asking questions about your medical analysis...</p>
                      </div>
                    </div>
                  ) : (
                    chatHistory.map((msg, i) => (
                      <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${msg.role === 'user' ? 'bg-blue-500 text-white' : darkMode ? 'bg-slate-800 text-gray-200' : 'bg-gray-100 text-gray-900'}`}>
                          <p className="text-sm">{msg.content}</p>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>

                <div className="flex gap-3">
                  <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && sendMessage()} placeholder="Ask about your health..." className={`flex-1 px-4 py-3 rounded-lg border outline-none ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300'}`} />
                  <button onClick={sendMessage} className="bg-blue-500 text-white p-3 rounded-lg hover:bg-blue-600 transition">
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Footer Disclaimer */}
      <footer className={`border-t ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} p-4 text-center text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
        <p>
          ⚠️ <strong>Medical Disclaimer:</strong> This analysis is educational only and not a substitute for professional medical advice. Always consult your healthcare provider.
        </p>
      </footer>
    </div>
  );
}

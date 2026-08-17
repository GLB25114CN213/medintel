import React, { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Sparkles, AlertCircle, RefreshCw } from "lucide-react";
import { apiService } from "../services/api.js";

export const AIChat = ({ analysis, token }) => {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Hello! I am MedIntel AI, your clinical health assistant. Ask me anything about your lab results, medical parameters, or health recommendations."
    }
  ]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, chatLoading]);

  // Load chat history if logged in
  useEffect(() => {
    if (token) {
      apiService.getChatHistory(token).then((history) => {
        if (history && history.length > 0) {
          setMessages(history.map(m => ({ role: m.role, content: m.content })));
        }
      }).catch((err) => console.warn("Chat history load warning:", err));
    }
  }, [token]);

  const handleSend = async (textToSend) => {
    const text = textToSend || input;
    if (!text.trim() || chatLoading) return;

    const userMsg = { role: "user", content: text.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setChatLoading(true);

    try {
      // Build context from analysis
      let reportContext = null;
      if (analysis) {
        reportContext = {
          patientInfo: analysis.section1,
          healthScore: analysis.section4?.healthScore,
          alerts: (analysis.section3?.abnormalFindings || []).map(f => f.title),
          biomarkers: (analysis.section2_table || []).map(b => `${b.testName}: ${b.result} ${b.unit}`),
          summaryPatientFriendly: analysis.section7
        };
      }

      const res = await apiService.sendChatMessage(updatedMessages, reportContext, token);
      if (res.message) {
        setMessages([...updatedMessages, res.message]);
      }
    } catch (err) {
      setMessages([
        ...updatedMessages,
        { role: "assistant", content: `I'm sorry, I ran into an error: ${err.message}. Please try asking again.` }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto h-[650px] flex flex-col rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl overflow-hidden animate-fadeIn">
      
      {/* Header */}
      <div className="p-4 sm:p-5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <span>MedIntel AI Health Assistant</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            </h3>
            <p className="text-xs text-slate-400">
              {analysis ? `Context Aware: Report for ${analysis.section1?.name || "Patient"}` : "General Medical & Clinical AI Assistant"}
            </p>
          </div>
        </div>

        <button
          onClick={() => setMessages([{ role: "assistant", content: "Chat reset. How can I help you today?" }])}
          className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-all"
          title="Clear Chat"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {messages.map((msg, idx) => {
          const isAI = msg.role === "assistant";
          return (
            <div
              key={idx}
              className={`flex items-start gap-3 ${isAI ? "justify-start" : "justify-end"}`}
            >
              {isAI && (
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[80%] p-4 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                  isAI
                    ? "bg-slate-950/80 border border-slate-800 text-slate-200"
                    : "bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-medium"
                }`}
              >
                {msg.content}
              </div>

              {!isAI && (
                <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}

        {chatLoading && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Bot className="w-4 h-4 animate-spin" />
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>Analyzing clinical context & formulating response...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompt Chips */}
      {analysis && messages.length <= 2 && (
        <div className="px-4 py-2 bg-slate-950/40 border-t border-slate-800/60 flex items-center gap-2 overflow-x-auto text-[11px] text-slate-300">
          <span className="text-slate-500 font-medium shrink-0">Suggested:</span>
          <button
            onClick={() => handleSend("Can you explain my abnormal lab values in simple terms?")}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 hover:text-emerald-400 transition-colors shrink-0"
          >
            Explain abnormal values
          </button>
          <button
            onClick={() => handleSend("What diet or lifestyle changes should I make based on this report?")}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 hover:text-emerald-400 transition-colors shrink-0"
          >
            Diet & lifestyle advice
          </button>
          <button
            onClick={() => handleSend("What medical specialist should I consult for these findings?")}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 hover:text-emerald-400 transition-colors shrink-0"
          >
            Which doctor to consult
          </button>
        </div>
      )}

      {/* Input Box */}
      <div className="p-4 bg-slate-950/90 border-t border-slate-800">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a medical question about your report..."
            className="flex-1 px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 focus:border-emerald-500/50 text-slate-100 text-xs sm:text-sm focus:outline-none transition-all placeholder:text-slate-500"
          />
          <button
            type="submit"
            disabled={!input.trim() || chatLoading}
            className="px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold transition-all disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

    </div>
  );
};

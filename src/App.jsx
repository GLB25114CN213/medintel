
import React, { useState } from "react";
import { HeartPulse, Mail, Lock, Moon, Sun } from "lucide-react";

export default function App() {
  const [darkMode, setDarkMode] = useState(true);

  return (
    <div
      className={`min-h-screen flex items-center justify-center transition-all duration-500 ${
        darkMode
          ? "bg-gradient-to-br from-[#0f172a] via-[#111827] to-[#1e293b]"
          : "bg-gradient-to-br from-blue-100 via-cyan-50 to-white"
      }`}
    >
      {/* Theme Toggle */}
      <button
        onClick={() => setDarkMode(!darkMode)}
        className="absolute top-6 right-6 bg-white/10 backdrop-blur-md border border-white/20 p-3 rounded-xl text-white hover:scale-105 transition"
      >
        {darkMode ? <Sun size={20} /> : <Moon size={20} />}
      </button>

      {/* Card */}
      <div
        className={`w-[420px] p-10 rounded-3xl shadow-2xl backdrop-blur-xl border transition-all duration-500 ${
          darkMode
            ? "bg-white/10 border-white/10 text-white"
            : "bg-white/80 border-white/50 text-gray-800"
        }`}
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="bg-gradient-to-r from-cyan-400 to-blue-500 p-5 rounded-2xl shadow-lg mb-5">
            <HeartPulse className="text-white" size={42} />
          </div>

          <h1 className="text-5xl font-extrabold tracking-tight">
            MedIntel AI
          </h1>

          <p
            className={`mt-3 text-center text-lg ${
              darkMode ? "text-gray-300" : "text-gray-600"
            }`}
          >
            AI-Powered Medical Report Analysis
          </p>
        </div>

        {/* Form */}
        <div className="space-y-5">
          {/* Email */}
          <div>
            <label className="block mb-2 font-medium">Email</label>

            <div
              className={`flex items-center rounded-xl px-4 py-3 border ${
                darkMode
                  ? "bg-white/5 border-white/10"
                  : "bg-gray-100 border-gray-200"
              }`}
            >
              <Mail size={18} className="mr-3 opacity-70" />

              <input
                type="email"
                placeholder="your@email.com"
                className="bg-transparent outline-none w-full"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block mb-2 font-medium">Password</label>

            <div
              className={`flex items-center rounded-xl px-4 py-3 border ${
                darkMode
                  ? "bg-white/5 border-white/10"
                  : "bg-gray-100 border-gray-200"
              }`}
            >
              <Lock size={18} className="mr-3 opacity-70" />

              <input
                type="password"
                placeholder="••••••••"
                className="bg-transparent outline-none w-full"
              />
            </div>
          </div>

          {/* Button */}
          <button className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold text-lg hover:scale-[1.02] transition shadow-lg">
            Log In
          </button>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p
            className={`${
              darkMode ? "text-gray-300" : "text-gray-600"
            }`}
          >
            Don’t have an account?{" "}
            <span className="text-cyan-400 font-semibold cursor-pointer hover:underline">
              Sign up
            </span>
          </p>

          <div
            className={`mt-6 rounded-2xl p-4 text-sm border ${
              darkMode
                ? "bg-white/5 border-white/10 text-gray-300"
                : "bg-blue-50 border-blue-100 text-gray-700"
            }`}
          >
            <strong>Demo credentials:</strong> Any email + password works for
            testing.
          </div>
        </div>
      </div>
    </div>
  );
}
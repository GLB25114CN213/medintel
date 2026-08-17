/**
 * MedIntel AI - Centralized API Service Client
 */

import { API_BASE } from "../config/constants.js";

const getHeaders = (token, extraHeaders = {}) => {
  const headers = { ...extraHeaders };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
};

const handleResponse = async (response) => {
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    throw new Error(text || `Server Error (${response.status})`);
  }

  if (!response.ok || !data.success) {
    throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
  }

  return data;
};

export const apiService = {
  // Medical Document Analysis
  async analyzeReport(file, clientOcrText = "", token = null) {
    const formData = new FormData();
    formData.append("file", file);
    if (clientOcrText) {
      formData.append("clientOcrText", clientOcrText);
    }

    const response = await fetch(`${API_BASE}/analyze`, {
      method: "POST",
      headers: getHeaders(token),
      body: formData,
    });

    return handleResponse(response);
  },

  // AI Medical Chat Assistant
  async sendChatMessage(messages, reportContext = null, token = null) {
    const response = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: getHeaders(token, { "Content-Type": "application/json" }),
      body: JSON.stringify({ messages, reportContext }),
    });

    return handleResponse(response);
  },

  // Auth: Login
  async login(email, password) {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    return handleResponse(response);
  },

  // Auth: Register
  async register(full_name, email, password) {
    const response = await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name, email, password }),
    });

    return handleResponse(response);
  },

  // Auth: Fetch Current User Profile
  async getCurrentUser(token) {
    if (!token) return null;
    const response = await fetch(`${API_BASE}/api/auth/me`, {
      method: "GET",
      headers: getHeaders(token),
    });

    return handleResponse(response);
  },

  // Report History
  async getSavedReports(token) {
    if (!token) return [];
    const response = await fetch(`${API_BASE}/api/reports`, {
      method: "GET",
      headers: getHeaders(token),
    });

    const data = await handleResponse(response);
    return data.reports || [];
  },

  // Chat History
  async getChatHistory(token) {
    if (!token) return [];
    const response = await fetch(`${API_BASE}/api/chat/history`, {
      method: "GET",
      headers: getHeaders(token),
    });

    const data = await handleResponse(response);
    return data.messages || [];
  }
};

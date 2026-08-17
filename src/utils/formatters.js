/**
 * MedIntel AI - Formatters & UI Helper Utilities
 */

export const cleanValue = (val, fallback = "Not Available") => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "number") return String(val);
  if (typeof val !== "string") return fallback;
  const trimmed = val.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower === "unspecified" ||
    lower === "n/a" ||
    lower === "none" ||
    lower === "null" ||
    trimmed === ""
  ) {
    return fallback;
  }
  return trimmed;
};

export const getStatusBadgeStyle = (status) => {
  const s = String(status || "").toLowerCase();
  if (s.includes("critical")) {
    return {
      bg: "bg-red-500/15 border-red-500/30 text-red-400",
      dot: "bg-red-500",
      text: "Critical"
    };
  }
  if (s.includes("high")) {
    return {
      bg: "bg-amber-500/15 border-amber-500/30 text-amber-400",
      dot: "bg-amber-500",
      text: "High"
    };
  }
  if (s.includes("low")) {
    return {
      bg: "bg-blue-500/15 border-blue-500/30 text-blue-400",
      dot: "bg-blue-500",
      text: "Low"
    };
  }
  if (s.includes("borderline")) {
    return {
      bg: "bg-purple-500/15 border-purple-500/30 text-purple-400",
      dot: "bg-purple-500",
      text: "Borderline"
    };
  }
  return {
    bg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
    dot: "bg-emerald-500",
    text: "Normal"
  };
};

export const getHealthScoreColor = (score) => {
  const s = Number(score) || 75;
  if (s >= 85) return { text: "text-emerald-400", stroke: "#10b981", label: "Optimal Health" };
  if (s >= 70) return { text: "text-blue-400", stroke: "#3b82f6", label: "Good Condition" };
  if (s >= 50) return { text: "text-amber-400", stroke: "#f59e0b", label: "Requires Attention" };
  return { text: "text-red-400", stroke: "#ef4444", label: "High Priority / Consult Doctor" };
};

export const formatDate = (dateString) => {
  if (!dateString) return "Not Available";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch (_) {
    return dateString;
  }
};

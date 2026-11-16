/*
   VISION-SHARED — palette, backend base URL and the small HTML/format helpers
   every vision domain module (movies, football, weather, ...) builds on.
*/

export const PALETTE = {
  cardBg: "rgba(5,7,10,0.88)",
  border: "rgba(139,233,253,0.35)",
  borderGlow: "rgba(53,224,242,0.55)",
  text: "#e6fbff",
  textDim: "#8ceef9",
  accent: "#35e0f2",
};

export const BACKEND = (import.meta.env.VITE_BACKEND_URL || "http://localhost:8001").replace(/\/+$/, "");

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Only http(s) links are ever opened, whatever the API hands back.
export const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "");

export const fmtDate = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d) ? d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "";
};

export function timeAgo(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const h = Math.floor((Date.now() - t) / 3600000);
  if (h < 1) return "under 1h ago";
  return h < 48 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

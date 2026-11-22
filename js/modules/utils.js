export const qs = (selector, scope = document) => scope.querySelector(selector);
export const qsa = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

export function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = value?.toDate ? value.toDate() : new Date(value);

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
}

export function formatNumber(value = 0) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

export function truncate(text = "", limit = 132) {
  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit).trim()}...`;
}

export function getInitials(name = "Student") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase())
    .join("") || "NP";
}

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function parseTags(input) {
  if (Array.isArray(input)) {
    return input.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(input || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export function getQueryParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

export function debounce(callback, wait = 250) {
  let timeoutId;

  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => callback(...args), wait);
  };
}

export function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function summarizeFileSize(size = 0) {
  if (!size) {
    return "Unknown size";
  }

  const units = ["B", "KB", "MB", "GB"];
  let current = Number(size);
  let unitIndex = 0;

  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }

  return `${current.toFixed(current >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function slugify(text = "") {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function getProviderLabel(user) {
  const providerId = user?.providerData?.[0]?.providerId;

  if (providerId === "google.com") {
    return "Google";
  }

  if (providerId === "password") {
    return "Email Password";
  }

  return "Firebase";
}

export function getNoteFileLinks(note = {}) {
  const openUrl = note.fileUrl || note.downloadUrl || note.driveViewUrl || note.driveDownloadUrl || "";
  const downloadUrl = note.downloadUrl || note.fileUrl || note.driveDownloadUrl || note.driveViewUrl || "";
  const previewUrl = note.previewUrl || note.fileUrl || note.downloadUrl || note.drivePreviewUrl || "";

  return {
    provider: note.storageProvider || (note.storagePath ? "firebase" : note.driveFileId ? "google-drive" : "unknown"),
    openUrl,
    downloadUrl,
    previewUrl
  };
}

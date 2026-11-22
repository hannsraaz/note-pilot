/**
 * NotePilot Notes Data Module
 * Interacts with the backend REST endpoints.
 * Never connects directly to third-party APIs with secret keys.
 */

import { apiRequest } from "./api.js";
import { parseTags } from "./utils.js";

export async function createNoteRecord(noteInput, uploadMeta, user) {
  const result = await apiRequest("/api/notes", {
    method: "POST",
    requiresAuth: true,
    body: {
      note: {
        title: noteInput.title,
        subject: noteInput.subject,
        semester: noteInput.semester,
        category: noteInput.category,
        description: noteInput.description,
        tags: parseTags(noteInput.tags)
      },
      uploadMeta
    }
  });

  return result.id;
}

export async function updateNoteRecord(noteId, payload, userId) {
  await apiRequest(`/api/notes/${noteId}`, {
    method: "PUT",
    requiresAuth: true,
    body: {
      title: payload.title,
      subject: payload.subject,
      semester: payload.semester,
      category: payload.category,
      description: payload.description,
      tags: parseTags(payload.tags)
    }
  });
}

export async function deleteNoteRecord(noteId, userId) {
  await apiRequest(`/api/notes/${noteId}`, {
    method: "DELETE",
    requiresAuth: true
  });
}

export async function fetchTrendingNotes(limitCount = 6) {
  return await apiRequest(`/api/notes?filter=trending&limit=${limitCount}`);
}

export async function fetchRecentNotes(limitCount = 6) {
  return await apiRequest(`/api/notes?filter=recent&limit=${limitCount}`);
}

export async function fetchBrowseNotes({ search = "", semester = "all", category = "all", limitCount = 24 } = {}) {
  const params = new URLSearchParams();
  if (semester && semester !== "all") params.set("semester", semester);
  if (category && category !== "all") params.set("category", category);
  if (search && search.trim()) params.set("search", search.trim());
  params.set("limit", String(limitCount));

  return await apiRequest(`/api/notes?${params.toString()}`);
}

export async function fetchNoteById(noteId) {
  if (!noteId) return null;
  try {
    return await apiRequest(`/api/notes/${noteId}`);
  } catch {
    return null;
  }
}

export async function fetchRelatedNotes(note, limitCount = 3) {
  if (!note) return [];
  const allRecent = await fetchBrowseNotes({ semester: note.semester, limitCount: 18 });
  return allRecent
    .filter((item) => item.id !== note.id && (item.subjectLower === note.subjectLower || item.semester === note.semester))
    .slice(0, limitCount);
}

export async function fetchUserUploads(userId) {
  if (!userId) return [];
  return await apiRequest(`/api/users/${userId}/uploads`);
}

export async function fetchSavedNotes(userId) {
  if (!userId) return [];
  return await apiRequest(`/api/users/${userId}/saved`, {
    requiresAuth: true
  });
}

export async function getUserEngagementState(noteId, userId) {
  if (!userId || !noteId) {
    return { liked: false, saved: false };
  }

  try {
    return await apiRequest(`/api/notes/${noteId}/engagement`);
  } catch {
    return { liked: false, saved: false };
  }
}

export async function toggleLikeNote(noteId, userId) {
  const result = await apiRequest(`/api/notes/${noteId}/like`, {
    method: "POST",
    requiresAuth: true
  });
  return Boolean(result.liked);
}

export async function toggleSavedNote(noteId, userId) {
  const result = await apiRequest(`/api/notes/${noteId}/save`, {
    method: "POST",
    requiresAuth: true
  });
  return Boolean(result.saved);
}

export async function recordNoteDownload(noteId) {
  try {
    await apiRequest(`/api/notes/${noteId}/download`, { method: "POST" });
  } catch {
    // Non-critical metric increment
  }
}

export async function fetchComments(noteId) {
  if (!noteId) return [];
  return await apiRequest(`/api/notes/${noteId}/comments`);
}

export async function addCommentToNote(noteId, user, text) {
  await apiRequest(`/api/notes/${noteId}/comments`, {
    method: "POST",
    requiresAuth: true,
    body: { text }
  });
}

export async function deleteCommentFromNote(noteId, commentId, userId) {
  await apiRequest(`/api/notes/${noteId}/comments/${commentId}`, {
    method: "DELETE",
    requiresAuth: true
  });
}

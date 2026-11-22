/**
 * Firebase Auth and Firestore REST API Client for Cloudflare Workers
 * Uses the secret FIREBASE_API_KEY directly from Cloudflare Worker env
 */

const FIREBASE_AUTH_BASE = "https://identitytoolkit.googleapis.com/v1";
const SECURE_TOKEN_BASE = "https://securetoken.googleapis.com/v1";

function getFirestoreBase(env) {
  const projectId = env.FIREBASE_PROJECT_ID || "notepilot-8ebf4";
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

function firestoreFetch(url, options = {}, idToken) {
  const headers = new Headers(options.headers || {});
  if (idToken) {
    headers.set("Authorization", `Bearer ${idToken}`);
  }
  return fetch(url, { ...options, headers });
}

// ==========================================
// Firestore REST Value Converters
// ==========================================

export function fromFirestoreValue(val) {
  if (!val || typeof val !== "object") return null;
  if ("stringValue" in val) return val.stringValue;
  if ("integerValue" in val) return parseInt(val.integerValue, 10);
  if ("doubleValue" in val) return parseFloat(val.doubleValue);
  if ("booleanValue" in val) return val.booleanValue;
  if ("timestampValue" in val) return val.timestampValue;
  if ("nullValue" in val) return null;
  if ("arrayValue" in val) return (val.arrayValue?.values || []).map(fromFirestoreValue);
  if ("mapValue" in val) return fromFirestoreFields(val.mapValue?.fields || {});
  return null;
}

export function fromFirestoreFields(fields = {}) {
  const result = {};
  for (const [key, val] of Object.entries(fields)) {
    result[key] = fromFirestoreValue(val);
  }
  return result;
}

export function fromFirestoreDoc(doc) {
  if (!doc || !doc.fields) return null;
  const data = fromFirestoreFields(doc.fields);
  const id = doc.name ? doc.name.split("/").pop() : undefined;
  return {
    id,
    ...data,
    _createTime: doc.createTime,
    _updateTime: doc.updateTime
  };
}

export function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "string") return { stringValue: val };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (val instanceof Date) {
    return { timestampValue: val.toISOString() };
  }
  if (typeof val === "object") {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      fields[k] = toFirestoreValue(v);
    }
  }
  return fields;
}

// ==========================================
// Authentication Endpoints (Identity Toolkit)
// ==========================================

export async function signUpWithEmail(email, password, displayName, env) {
  const url = `${FIREBASE_AUTH_BASE}/accounts:signUp?key=${env.FIREBASE_API_KEY}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });

  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error?.message || "Failed to create account.");
    error.status = response.status === 400 ? 400 : 502;
    throw error;
  }

  // Update displayName if provided
  if (displayName) {
    await updateProfile(data.idToken, { displayName }, env);
  }

  // Sync profile to Firestore
  await syncUserProfile(data.localId, {
    uid: data.localId,
    email: data.email,
    displayName: displayName || "Student",
    photoURL: ""
  }, env, data.idToken);

  return {
    user: {
      uid: data.localId,
      email: data.email,
      displayName: displayName || "Student",
      photoURL: ""
    },
    token: data.idToken,
    refreshToken: data.refreshToken
  };
}

export async function signInWithEmail(email, password, env) {
  const url = `${FIREBASE_AUTH_BASE}/accounts:signInWithPassword?key=${env.FIREBASE_API_KEY}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });

  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error?.message || "Invalid credentials.");
    error.status = response.status === 400 ? 401 : 502;
    throw error;
  }

  // Sync profile to Firestore
  await syncUserProfile(data.localId, {
    uid: data.localId,
    email: data.email,
    displayName: data.displayName || "Student",
    photoURL: data.photoUrl || ""
  }, env, data.idToken);

  return {
    user: {
      uid: data.localId,
      email: data.email,
      displayName: data.displayName || "Student",
      photoURL: data.photoUrl || ""
    },
    token: data.idToken,
    refreshToken: data.refreshToken
  };
}

export async function signInWithGoogle(token, origin, env) {
  const url = `${FIREBASE_AUTH_BASE}/accounts:signInWithIdp?key=${env.FIREBASE_API_KEY}`;
  const param = token.startsWith("ya29.") ? `access_token=${encodeURIComponent(token)}` : `id_token=${encodeURIComponent(token)}`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      postBody: `${param}&providerId=google.com`,
      requestUri: origin || "http://localhost",
      returnIdpCredential: true,
      returnSecureToken: true
    })
  });

  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error?.message || "Google sign-in failed.");
    error.status = response.status === 400 ? 401 : 502;
    throw error;
  }

  await syncUserProfile(data.localId, {
    uid: data.localId,
    email: data.email,
    displayName: data.displayName || "Student",
    photoURL: data.photoUrl || ""
  }, env, data.idToken);

  return {
    user: {
      uid: data.localId,
      email: data.email,
      displayName: data.displayName || "Student",
      photoURL: data.photoUrl || ""
    },
    token: data.idToken,
    refreshToken: data.refreshToken
  };
}

export async function updateProfile(idToken, { displayName, photoURL }, env) {
  const url = `${FIREBASE_AUTH_BASE}/accounts:update?key=${env.FIREBASE_API_KEY}`;
  const body = { idToken, returnSecureToken: true };
  if (displayName !== undefined) body.displayName = displayName;
  if (photoURL !== undefined) body.photoUrl = photoURL;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return res.json();
}

export async function verifyUserToken(idToken, env) {
  if (!idToken) return null;

  const url = `${FIREBASE_AUTH_BASE}/accounts:lookup?key=${env.FIREBASE_API_KEY}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken })
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const user = data.users?.[0];
  if (!user) return null;

  return {
    uid: user.localId,
    email: user.email,
    displayName: user.displayName || "Student",
    photoURL: user.photoUrl || "",
    emailVerified: user.emailVerified
  };
}

export async function refreshIdToken(refreshToken, env) {
  const url = `${SECURE_TOKEN_BASE}/token?key=${env.FIREBASE_API_KEY}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });

  if (!response.ok) {
    throw new Error("Unable to refresh user token.");
  }

  const data = await response.json();
  return {
    token: data.id_token,
    refreshToken: data.refresh_token,
    userId: data.user_id
  };
}

// ==========================================
// Firestore Document and User Operations
// ==========================================

export async function syncUserProfile(uid, payload, env, idToken) {
  try {
    const base = getFirestoreBase(env);
    const now = new Date().toISOString();

    const existing = await getUserProfile(uid, env, idToken);

    const fields = {
      uid,
      displayName: payload.displayName || existing?.displayName || "Student",
      email: payload.email || existing?.email || "",
      photoURL: payload.photoURL || existing?.photoURL || "",
      providerId: payload.providerId || existing?.providerId || "firebase",
      lastLoginAt: now,
      createdAt: existing?.createdAt || now
    };

    const url = `${base}/users/${uid}?key=${env.FIREBASE_API_KEY}`;
    const res = await firestoreFetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: toFirestoreFields(fields) })
    }, idToken);

    if (!res.ok) {
      console.warn("Unable to sync user profile:", res.status);
    }
    return res.ok;
  } catch (error) {
    // Profile persistence must not prevent a successful Firebase login.
    console.warn("User profile sync skipped:", error);
    return false;
  }
}

export async function getUserProfile(uid, env, idToken) {
  const base = getFirestoreBase(env);
  const url = `${base}/users/${uid}?key=${env.FIREBASE_API_KEY}`;
  const res = await firestoreFetch(url, {}, idToken);
  if (!res.ok) return null;
  const doc = await res.json();
  return fromFirestoreDoc(doc);
}

// ==========================================
// Notes Operations
// ==========================================

export async function listAllNotes(env) {
  const base = getFirestoreBase(env);
  const url = `${base}/notes?pageSize=100&key=${env.FIREBASE_API_KEY}`;
  const res = await firestoreFetch(url, {}, idToken);
  if (!res.ok) return [];
  const data = await res.json();
  const docs = data.documents || [];
  return docs.map(fromFirestoreDoc).filter(Boolean);
}

export async function queryNotes({ filter, semester, category, search, limit = 30, uploaderId }, env) {
  let notes = await listAllNotes(env);

  if (uploaderId) {
    notes = notes.filter((n) => n.uploaderId === uploaderId);
  }

  if (semester && semester !== "all") {
    notes = notes.filter((n) => n.semester === semester);
  }

  if (category && category !== "all") {
    notes = notes.filter((n) => n.category === category);
  }

  if (search && search.trim()) {
    const term = search.trim().toLowerCase();
    notes = notes.filter((n) => {
      const searchTarget = (n.searchText || `${n.title} ${n.subject} ${n.description} ${n.tags?.join(" ")}`).toLowerCase();
      return searchTarget.includes(term);
    });
  }

  if (filter === "trending") {
    notes.sort((a, b) => {
      const diffLikes = (b.likeCount || 0) - (a.likeCount || 0);
      if (diffLikes !== 0) return diffLikes;
      return (b.downloadCount || 0) - (a.downloadCount || 0);
    });
  } else {
    // Default: recent (createdAt DESC)
    notes.sort((a, b) => {
      const timeA = new Date(a.createdAt || a._createTime || 0).getTime();
      const timeB = new Date(b.createdAt || b._createTime || 0).getTime();
      return timeB - timeA;
    });
  }

  return notes.slice(0, Number(limit) || 30);
}

export async function getNoteById(noteId, env) {
  const base = getFirestoreBase(env);
  const url = `${base}/notes/${noteId}?key=${env.FIREBASE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const doc = await res.json();
  return fromFirestoreDoc(doc);
}

export async function createNote(noteInput, uploadMeta, user, env, idToken) {
  const base = getFirestoreBase(env);
  const now = new Date().toISOString();

  const title = (noteInput.title || "").trim();
  const subject = (noteInput.subject || "").trim();
  const description = (noteInput.description || "").trim();
  const category = (noteInput.category || "").trim();
  const semester = (noteInput.semester || "").trim();
  const tags = Array.isArray(noteInput.tags) ? noteInput.tags : [];
  const searchText = [title, subject, description, category, semester, tags.join(" ")].join(" ").toLowerCase();

  const noteData = {
    title,
    titleLower: title.toLowerCase(),
    subject,
    subjectLower: subject.toLowerCase(),
    semester,
    category,
    description,
    tags,
    searchText,
    uploaderId: user.uid,
    uploaderName: user.displayName || "Student",
    uploaderEmail: user.email || "",
    uploaderPhotoURL: user.photoURL || "",
    storageProvider: uploadMeta.storageProvider || "firebase",
    storagePath: uploadMeta.storagePath || "",
    fileUrl: uploadMeta.fileUrl || "",
    downloadUrl: uploadMeta.downloadUrl || "",
    previewUrl: uploadMeta.previewUrl || "",
    fileName: uploadMeta.fileName || "",
    fileSize: Number(uploadMeta.fileSize || 0),
    likeCount: 0,
    bookmarkCount: 0,
    commentCount: 0,
    downloadCount: 0,
    createdAt: now,
    updatedAt: now
  };

  const url = `${base}/notes?key=${env.FIREBASE_API_KEY}`;
  const res = await firestoreFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toFirestoreFields(noteData) })
  }, idToken);

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || "Failed to create note record.");
  }

  const createdDoc = await res.json();
  return fromFirestoreDoc(createdDoc);
}

export async function updateNote(noteId, payload, userId, env, idToken) {
  const existing = await getNoteById(noteId, env);
  if (!existing) {
    throw new Error("Note not found.");
  }
  if (existing.uploaderId !== userId) {
    throw new Error("You can only edit notes that you uploaded.");
  }

  const title = (payload.title ?? existing.title).trim();
  const subject = (payload.subject ?? existing.subject).trim();
  const description = (payload.description ?? existing.description).trim();
  const category = (payload.category ?? existing.category).trim();
  const semester = (payload.semester ?? existing.semester).trim();
  const tags = Array.isArray(payload.tags) ? payload.tags : existing.tags || [];
  const searchText = [title, subject, description, category, semester, tags.join(" ")].join(" ").toLowerCase();

  const updateFields = {
    title,
    titleLower: title.toLowerCase(),
    subject,
    subjectLower: subject.toLowerCase(),
    description,
    category,
    semester,
    tags,
    searchText,
    updatedAt: new Date().toISOString()
  };

  const base = getFirestoreBase(env);
  const mask = Object.keys(updateFields).map((k) => `updateMask.fieldPaths=${k}`).join("&");
  const url = `${base}/notes/${noteId}?${mask}&key=${env.FIREBASE_API_KEY}`;

  const res = await firestoreFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toFirestoreFields(updateFields) })
  }, idToken);

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || "Failed to update note.");
  }

  return true;
}

export async function deleteNote(noteId, userId, env, idToken) {
  const existing = await getNoteById(noteId, env);
  if (!existing) return true;
  if (existing.uploaderId !== userId) {
    throw new Error("You can only delete notes that you uploaded.");
  }

  // Delete comments subcollection first
  const comments = await listComments(noteId, env);
  for (const comment of comments) {
    await deleteComment(noteId, comment.id, userId, env, true, idToken);
  }

  const base = getFirestoreBase(env);
  const url = `${base}/notes/${noteId}?key=${env.FIREBASE_API_KEY}`;
  const res = await firestoreFetch(url, { method: "DELETE" }, idToken);
  return res.ok;
}

// ==========================================
// Engagement: Like, Save, Download Counters
// ==========================================

export async function getUserEngagement(noteId, userId, env, idToken) {
  if (!userId) return { liked: false, saved: false };

  const base = getFirestoreBase(env);
  const [likeRes, saveRes] = await Promise.all([
    firestoreFetch(`${base}/users/${userId}/likedNotes/${noteId}?key=${env.FIREBASE_API_KEY}`, {}, idToken),
    firestoreFetch(`${base}/users/${userId}/savedNotes/${noteId}?key=${env.FIREBASE_API_KEY}`, {}, idToken)
  ]);

  return {
    liked: likeRes.status === 200,
    saved: saveRes.status === 200
  };
}

export async function toggleLikeNote(noteId, userId, env, idToken) {
  const base = getFirestoreBase(env);
  const note = await getNoteById(noteId, env);
  if (!note) throw new Error("Note not found.");

  const checkUrl = `${base}/users/${userId}/likedNotes/${noteId}?key=${env.FIREBASE_API_KEY}`;
  const checkRes = await firestoreFetch(checkUrl, {}, idToken);
  const alreadyLiked = checkRes.status === 200;

  if (alreadyLiked) {
    // Unlike
    await firestoreFetch(checkUrl, { method: "DELETE" }, idToken);
    const newLikes = Math.max(0, (note.likeCount || 1) - 1);
    await updateNoteFields(noteId, { likeCount: newLikes, updatedAt: new Date().toISOString() }, env, idToken);
    return false;
  } else {
    // Like
    await firestoreFetch(checkUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: toFirestoreFields({ noteId, createdAt: new Date().toISOString() })
      })
    }, idToken);
    const newLikes = (note.likeCount || 0) + 1;
    await updateNoteFields(noteId, { likeCount: newLikes, updatedAt: new Date().toISOString() }, env, idToken);
    return true;
  }
}

export async function toggleSaveNote(noteId, userId, env, idToken) {
  const base = getFirestoreBase(env);
  const note = await getNoteById(noteId, env);
  if (!note) throw new Error("Note not found.");

  const checkUrl = `${base}/users/${userId}/savedNotes/${noteId}?key=${env.FIREBASE_API_KEY}`;
  const checkRes = await firestoreFetch(checkUrl, {}, idToken);
  const alreadySaved = checkRes.status === 200;

  if (alreadySaved) {
    // Unsave
    await firestoreFetch(checkUrl, { method: "DELETE" }, idToken);
    const newCount = Math.max(0, (note.bookmarkCount || 1) - 1);
    await updateNoteFields(noteId, { bookmarkCount: newCount, updatedAt: new Date().toISOString() }, env, idToken);
    return false;
  } else {
    // Save
    await firestoreFetch(checkUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: toFirestoreFields({ noteId, createdAt: new Date().toISOString() })
      })
    }, idToken);
    const newCount = (note.bookmarkCount || 0) + 1;
    await updateNoteFields(noteId, { bookmarkCount: newCount, updatedAt: new Date().toISOString() }, env, idToken);
    return true;
  }
}

export async function recordDownload(noteId, env, idToken) {
  const note = await getNoteById(noteId, env);
  if (!note) return;
  const newCount = (note.downloadCount || 0) + 1;
  await updateNoteFields(noteId, { downloadCount: newCount, updatedAt: new Date().toISOString() }, env, idToken);
}

async function updateNoteFields(noteId, fields, env, idToken) {
  const base = getFirestoreBase(env);
  const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${k}`).join("&");
  const url = `${base}/notes/${noteId}?${mask}&key=${env.FIREBASE_API_KEY}`;
  await firestoreFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toFirestoreFields(fields) })
  }, idToken);
}

// ==========================================
// Comments Operations
// ==========================================

export async function listComments(noteId, env, idToken) {
  const base = getFirestoreBase(env);
  const url = `${base}/notes/${noteId}/comments?pageSize=100&key=${env.FIREBASE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const docs = data.documents || [];
  const comments = docs.map(fromFirestoreDoc).filter(Boolean);

  comments.sort((a, b) => {
    const timeA = new Date(a.createdAt || a._createTime || 0).getTime();
    const timeB = new Date(b.createdAt || b._createTime || 0).getTime();
    return timeB - timeA;
  });

  return comments;
}

export async function addComment(noteId, text, user, env, idToken) {
  const commentText = (text || "").trim();
  if (!commentText) throw new Error("Write a comment before submitting.");

  const base = getFirestoreBase(env);
  const now = new Date().toISOString();

  const commentData = {
    text: commentText,
    userId: user.uid,
    userName: user.displayName || "Student",
    userEmail: user.email || "",
    userPhotoURL: user.photoURL || "",
    createdAt: now
  };

  const url = `${base}/notes/${noteId}/comments?key=${env.FIREBASE_API_KEY}`;
  const res = await firestoreFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toFirestoreFields(commentData) })
  }, idToken);

  if (!res.ok) {
    throw new Error("Failed to post comment.");
  }

  // Increment commentCount
  const note = await getNoteById(noteId, env);
  if (note) {
    const newCount = (note.commentCount || 0) + 1;
    await updateNoteFields(noteId, { commentCount: newCount, updatedAt: now }, env, idToken);
  }

  const created = await res.json();
  return fromFirestoreDoc(created);
}

export async function deleteComment(noteId, commentId, userId, env, force = false, idToken) {
  const base = getFirestoreBase(env);
  const commentUrl = `${base}/notes/${noteId}/comments/${commentId}?key=${env.FIREBASE_API_KEY}`;

  if (!force) {
    const res = await firestoreFetch(commentUrl, {}, idToken);
    if (!res.ok) return true;
    const comment = fromFirestoreDoc(await res.json());
    const note = await getNoteById(noteId, env);

    if (comment.userId !== userId && note?.uploaderId !== userId) {
      throw new Error("You can only delete your own comments.");
    }
  }

  await firestoreFetch(commentUrl, { method: "DELETE" }, idToken);

  const note = await getNoteById(noteId, env);
  if (note) {
    const newCount = Math.max(0, (note.commentCount || 1) - 1);
    await updateNoteFields(noteId, { commentCount: newCount, updatedAt: new Date().toISOString() }, env, idToken);
  }

  return true;
}

// ==========================================
// User Saved Notes and Uploads
// ==========================================

export async function getUserSavedNotes(userId, env, idToken) {
  const base = getFirestoreBase(env);
  const url = `${base}/users/${userId}/savedNotes?pageSize=100&key=${env.FIREBASE_API_KEY}`;
  const res = await firestoreFetch(url, {}, idToken);
  if (!res.ok) return [];
  const data = await res.json();
  const docs = data.documents || [];
  const savedItems = docs.map(fromFirestoreDoc).filter(Boolean);

  const notes = await Promise.all(
    savedItems.map(async (savedItem) => {
      try {
        return await getNoteById(savedItem.id, env);
      } catch {
        return null;
      }
    })
  );

  return notes.filter(Boolean);
}

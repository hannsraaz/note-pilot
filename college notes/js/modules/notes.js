import {
  addDoc,
  collection,
  db,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch
} from "./firebase.js";
import { requireFirebaseConfig } from "./config.js";
import { parseTags } from "./utils.js";

function noteCollection() {
  requireFirebaseConfig();
  return collection(db, "notes");
}

function normalizeNotePayload(payload) {
  const title = payload.title.trim();
  const subject = payload.subject.trim();
  const description = payload.description.trim();
  const category = payload.category.trim();
  const semester = payload.semester.trim();
  const tags = parseTags(payload.tags);
  const searchText = [title, subject, description, category, semester, tags.join(" ")]
    .join(" ")
    .toLowerCase();

  return {
    title,
    titleLower: title.toLowerCase(),
    subject,
    subjectLower: subject.toLowerCase(),
    semester,
    category,
    description,
    tags,
    searchText
  };
}

function mapDocs(snapshot) {
  return snapshot.docs.map((item) => ({
    id: item.id,
    ...item.data()
  }));
}

export async function createNoteRecord(noteInput, uploadMeta, user) {
  requireFirebaseConfig();

  const normalized = normalizeNotePayload(noteInput);
  const payload = {
    ...normalized,
    uploaderId: user.uid,
    uploaderName: user.displayName || "Student",
    uploaderEmail: user.email || "",
    uploaderPhotoURL: user.photoURL || "",
    storageProvider: uploadMeta.storageProvider || "firebase",
    storagePath: uploadMeta.storagePath,
    fileUrl: uploadMeta.fileUrl,
    downloadUrl: uploadMeta.downloadUrl,
    previewUrl: uploadMeta.previewUrl,
    fileName: uploadMeta.fileName,
    fileSize: uploadMeta.fileSize,
    likeCount: 0,
    bookmarkCount: 0,
    commentCount: 0,
    downloadCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const created = await addDoc(noteCollection(), payload);
  return created.id;
}

export async function updateNoteRecord(noteId, payload, userId) {
  requireFirebaseConfig();

  const noteRef = doc(db, "notes", noteId);
  const noteSnapshot = await getDoc(noteRef);

  if (!noteSnapshot.exists()) {
    throw new Error("That note could not be found.");
  }

  if (noteSnapshot.data().uploaderId !== userId) {
    throw new Error("You can only edit notes that you uploaded.");
  }

  await updateDoc(noteRef, {
    ...normalizeNotePayload(payload),
    updatedAt: serverTimestamp()
  });
}

export async function deleteNoteRecord(noteId, userId) {
  requireFirebaseConfig();

  const noteRef = doc(db, "notes", noteId);
  const noteSnapshot = await getDoc(noteRef);

  if (!noteSnapshot.exists()) {
    return;
  }

  if (noteSnapshot.data().uploaderId !== userId) {
    throw new Error("You can only delete notes that you uploaded.");
  }

  const commentsSnapshot = await getDocs(collection(noteRef, "comments"));
  const batch = writeBatch(db);

  commentsSnapshot.forEach((commentDoc) => {
    batch.delete(commentDoc.ref);
  });

  batch.delete(noteRef);
  await batch.commit();
}

export async function fetchTrendingNotes(limitCount = 6) {
  requireFirebaseConfig();
  const snapshot = await getDocs(query(noteCollection(), orderBy("likeCount", "desc"), orderBy("downloadCount", "desc"), limit(limitCount)));
  return mapDocs(snapshot);
}

export async function fetchRecentNotes(limitCount = 6) {
  requireFirebaseConfig();
  const snapshot = await getDocs(query(noteCollection(), orderBy("createdAt", "desc"), limit(limitCount)));
  return mapDocs(snapshot);
}

export async function fetchBrowseNotes({ search = "", semester = "all", category = "all", limitCount = 24 } = {}) {
  requireFirebaseConfig();

  const constraints = [];

  if (semester && semester !== "all") {
    constraints.push(where("semester", "==", semester));
  }

  if (category && category !== "all") {
    constraints.push(where("category", "==", category));
  }

  constraints.push(orderBy("createdAt", "desc"), limit(limitCount));

  const snapshot = await getDocs(query(noteCollection(), ...constraints));
  const notes = mapDocs(snapshot);
  const normalizedTerm = search.trim().toLowerCase();

  if (!normalizedTerm) {
    return notes;
  }

  return notes.filter((note) => note.searchText?.includes(normalizedTerm));
}

export async function fetchNoteById(noteId) {
  requireFirebaseConfig();
  const snapshot = await getDoc(doc(db, "notes", noteId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function fetchRelatedNotes(note, limitCount = 3) {
  requireFirebaseConfig();
  const allRecent = await fetchBrowseNotes({ semester: note.semester, limitCount: 18 });
  return allRecent
    .filter((item) => item.id !== note.id && (item.subjectLower === note.subjectLower || item.semester === note.semester))
    .slice(0, limitCount);
}

export async function fetchUserUploads(userId) {
  requireFirebaseConfig();
  const snapshot = await getDocs(query(noteCollection(), where("uploaderId", "==", userId), orderBy("createdAt", "desc")));
  return mapDocs(snapshot);
}

export async function fetchSavedNotes(userId) {
  requireFirebaseConfig();
  const savedSnapshot = await getDocs(query(collection(db, "users", userId, "savedNotes"), orderBy("createdAt", "desc")));

  const notes = await Promise.all(
    savedSnapshot.docs.map(async (savedDoc) => {
      const noteSnapshot = await getDoc(doc(db, "notes", savedDoc.id));
      return noteSnapshot.exists() ? { id: noteSnapshot.id, ...noteSnapshot.data() } : null;
    })
  );

  return notes.filter(Boolean);
}

export async function getUserEngagementState(noteId, userId) {
  requireFirebaseConfig();

  if (!userId) {
    return { liked: false, saved: false };
  }

  const [likedSnapshot, savedSnapshot] = await Promise.all([
    getDoc(doc(db, "users", userId, "likedNotes", noteId)),
    getDoc(doc(db, "users", userId, "savedNotes", noteId))
  ]);

  return {
    liked: likedSnapshot.exists(),
    saved: savedSnapshot.exists()
  };
}

async function toggleUserCollectionNote({ noteId, userId, collectionName, counterField }) {
  requireFirebaseConfig();

  const noteRef = doc(db, "notes", noteId);
  const userNoteRef = doc(db, "users", userId, collectionName, noteId);

  return runTransaction(db, async (transaction) => {
    const [noteSnapshot, userNoteSnapshot] = await Promise.all([
      transaction.get(noteRef),
      transaction.get(userNoteRef)
    ]);

    if (!noteSnapshot.exists()) {
      throw new Error("That note could not be found.");
    }

    const exists = userNoteSnapshot.exists();

    if (exists) {
      transaction.delete(userNoteRef);
      transaction.update(noteRef, {
        [counterField]: Math.max((noteSnapshot.data()[counterField] || 1) - 1, 0),
        updatedAt: serverTimestamp()
      });
    } else {
      transaction.set(userNoteRef, {
        noteId,
        createdAt: serverTimestamp()
      });
      transaction.update(noteRef, {
        [counterField]: increment(1),
        updatedAt: serverTimestamp()
      });
    }

    return !exists;
  });
}

export function toggleLikeNote(noteId, userId) {
  return toggleUserCollectionNote({
    noteId,
    userId,
    collectionName: "likedNotes",
    counterField: "likeCount"
  });
}

export function toggleSavedNote(noteId, userId) {
  return toggleUserCollectionNote({
    noteId,
    userId,
    collectionName: "savedNotes",
    counterField: "bookmarkCount"
  });
}

export async function recordNoteDownload(noteId) {
  requireFirebaseConfig();
  await updateDoc(doc(db, "notes", noteId), {
    downloadCount: increment(1),
    updatedAt: serverTimestamp()
  });
}

export async function fetchComments(noteId) {
  requireFirebaseConfig();
  const snapshot = await getDocs(query(collection(db, "notes", noteId, "comments"), orderBy("createdAt", "desc")));
  return mapDocs(snapshot);
}

export async function addCommentToNote(noteId, user, text) {
  requireFirebaseConfig();

  const commentText = text.trim();

  if (!commentText) {
    throw new Error("Write a comment before submitting.");
  }

  await addDoc(collection(db, "notes", noteId, "comments"), {
    text: commentText,
    userId: user.uid,
    userName: user.displayName || "Student",
    userEmail: user.email || "",
    userPhotoURL: user.photoURL || "",
    createdAt: serverTimestamp()
  });

  await updateDoc(doc(db, "notes", noteId), {
    commentCount: increment(1),
    updatedAt: serverTimestamp()
  });
}

export async function deleteCommentFromNote(noteId, commentId, userId) {
  requireFirebaseConfig();

  const commentRef = doc(db, "notes", noteId, "comments", commentId);
  const commentSnapshot = await getDoc(commentRef);

  if (!commentSnapshot.exists()) {
    return;
  }

  if (commentSnapshot.data().userId !== userId) {
    throw new Error("You can only delete your own comments.");
  }

  await deleteDoc(commentRef);
  await updateDoc(doc(db, "notes", noteId), {
    commentCount: increment(-1),
    updatedAt: serverTimestamp()
  });
}

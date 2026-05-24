import {
  auth,
  collection,
  createUserWithEmailAndPassword,
  db,
  doc,
  getDoc,
  GoogleAuthProvider,
  onAuthStateChanged,
  serverTimestamp,
  setDoc,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile
} from "./firebase.js";
import { firebaseConfigured, requireFirebaseConfig } from "./config.js";

let currentUser = null;
let syncPromise = null;

const googleProvider = firebaseConfigured ? new GoogleAuthProvider() : null;

if (googleProvider) {
  googleProvider.setCustomParameters({ prompt: "select_account" });
}

async function syncUserProfile(user, extra = {}) {
  if (!db || !user) {
    return null;
  }

  if (!syncPromise) {
    syncPromise = (async () => {
      const userRef = doc(collection(db, "users"), user.uid);
      const snapshot = await getDoc(userRef);
      const payload = {
        uid: user.uid,
        displayName: extra.displayName || user.displayName || "Student",
        email: user.email || "",
        photoURL: user.photoURL || "",
        providerId: user.providerData?.[0]?.providerId || "firebase",
        lastLoginAt: serverTimestamp()
      };

      if (!snapshot.exists()) {
        payload.createdAt = serverTimestamp();
      }

      await setDoc(userRef, payload, { merge: true });
      return payload;
    })().finally(() => {
      syncPromise = null;
    });
  }

  return syncPromise;
}

export function observeAuthState(callback) {
  if (!firebaseConfigured || !auth) {
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, async (user) => {
    currentUser = user || null;

    if (user) {
      await syncUserProfile(user);
    }

    callback(user || null);
  });
}

export async function signInWithGoogle() {
  requireFirebaseConfig();
  const result = await signInWithPopup(auth, googleProvider);
  await syncUserProfile(result.user);
  currentUser = result.user;
  return result.user;
}

export async function signUpWithEmail({ name, email, password }) {
  requireFirebaseConfig();
  const credentials = await createUserWithEmailAndPassword(auth, email, password);

  if (name?.trim()) {
    await updateProfile(credentials.user, {
      displayName: name.trim()
    });
  }

  await syncUserProfile(credentials.user, { displayName: name.trim() });
  currentUser = credentials.user;
  return credentials.user;
}

export async function signInWithEmail({ email, password }) {
  requireFirebaseConfig();
  const credentials = await signInWithEmailAndPassword(auth, email, password);
  await syncUserProfile(credentials.user);
  currentUser = credentials.user;
  return credentials.user;
}

export async function logoutUser() {
  requireFirebaseConfig();
  await signOut(auth);
  currentUser = null;
}

export function getCurrentUser() {
  return currentUser;
}

export async function getUserProfile(userId) {
  requireFirebaseConfig();
  const snapshot = await getDoc(doc(collection(db, "users"), userId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

import { config, firebaseConfigured, requireFirebaseConfig } from "./config.js";

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  increment,
  runTransaction,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-storage.js";

let firebaseApp = null;
let auth = null;
let db = null;
let storage = null;

if (firebaseConfigured) {
  firebaseApp = getApps().length ? getApp() : initializeApp(config.firebase);
  auth = getAuth(firebaseApp);
  db = getFirestore(firebaseApp);
  storage = getStorage(firebaseApp);
}

export {
  addDoc,
  auth,
  collection,
  createUserWithEmailAndPassword,
  db,
  deleteDoc,
  deleteObject,
  doc,
  getDoc,
  getDownloadURL,
  getDocs,
  GoogleAuthProvider,
  increment,
  limit,
  onAuthStateChanged,
  orderBy,
  query,
  ref,
  runTransaction,
  serverTimestamp,
  setDoc,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  storage,
  uploadBytesResumable,
  updateDoc,
  updateProfile,
  where,
  writeBatch
};

export function ensureFirebaseReady() {
  requireFirebaseConfig();
  return { auth, db, storage };
}

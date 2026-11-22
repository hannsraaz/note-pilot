import { storage } from "./firebase.js";
import { deleteObject, ref } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-storage.js";
import { config } from "./config.js";

let googleAccessToken = sessionStorage.getItem("google_drive_access_token") || null;

export function getGoogleDriveToken() {
  return googleAccessToken;
}

export function setGoogleDriveToken(token) {
  googleAccessToken = token;
  if (token) {
    sessionStorage.setItem("google_drive_access_token", token);
  } else {
    sessionStorage.removeItem("google_drive_access_token");
  }
}

function loadGsiScript() {
  return new Promise((resolve, reject) => {
    if (typeof google !== "undefined" && google.accounts && google.accounts.oauth2) {
      resolve();
      return;
    }

    // Check if the script tag is already in the document to prevent duplicates
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Identity Services.")));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (typeof google !== "undefined" && google.accounts && google.accounts.oauth2) {
        resolve();
      } else {
        reject(new Error("Google Identity Services script failed to initialize."));
      }
    };
    script.onerror = () => {
      reject(new Error("Failed to load Google Identity Services script."));
    };
    document.head.appendChild(script);
  });
}

export function authenticateGoogleDrive() {
  return new Promise((resolve, reject) => {
    if (googleAccessToken) {
      resolve(googleAccessToken);
      return;
    }

    loadGsiScript()
      .then(() => {
        if (!config.googleDrive.clientId) {
          reject(new Error("Google Drive Client ID is not configured. Add it in js/env.js."));
          return;
        }

        try {
          const client = google.accounts.oauth2.initTokenClient({
            client_id: config.googleDrive.clientId,
            scope: "https://www.googleapis.com/auth/drive.file",
            callback: (response) => {
              if (response.error) {
                reject(new Error(`Google Authentication failed: ${response.error_description || response.error}`));
                return;
              }
              if (response.access_token) {
                setGoogleDriveToken(response.access_token);
                resolve(response.access_token);
              } else {
                reject(new Error("No access token returned from Google."));
              }
            }
          });
          client.requestAccessToken({ prompt: "consent" });
        } catch (error) {
          reject(error);
        }
      })
      .catch(reject);
  });
}

export async function uploadPdfToStorage(file, user, { onProgress } = {}) {
  if (!user?.uid) {
    throw new Error("Sign in before uploading notes.");
  }

  if (!file) {
    throw new Error("Select a PDF file before uploading.");
  }

  if (file.type !== "application/pdf") {
    throw new Error("Only PDF files are supported.");
  }

  if (file.size > 25 * 1024 * 1024) {
    throw new Error("File size exceeds the 25 MB limit.");
  }

  // 1. Authenticate with Google Drive
  const token = await authenticateGoogleDrive();

  // 2. Perform multipart upload using XMLHttpRequest to support progress tracking
  const fileId = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    const boundary = "notepilot_drive_upload_boundary";
    xhr.setRequestHeader("Content-Type", `multipart/related; boundary=${boundary}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && typeof onProgress === "function") {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response.id);
        } catch (e) {
          reject(new Error("Invalid response received from Google Drive API."));
        }
      } else {
        if (xhr.status === 401) {
          // Token expired or invalid, reset it
          setGoogleDriveToken(null);
          reject(new Error("Google Drive session expired. Please try uploading again to re-authenticate."));
        } else {
          reject(new Error(`Google Drive Upload failed (Status ${xhr.status}): ${xhr.statusText || xhr.responseText}`));
        }
      }
    };

    xhr.onerror = () => {
      reject(new Error("A network error occurred while uploading to Google Drive. Check your connection."));
    };

    const metadata = {
      name: file.name,
      description: "Uploaded via NotePilot sharing platform",
      mimeType: "application/pdf"
    };

    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target.result;
      const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
      const mediaPartHeader = `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`;
      const mediaPartFooter = `\r\n--${boundary}--`;

      const ui8Metadata = new TextEncoder().encode(metadataPart);
      const ui8MediaHeader = new TextEncoder().encode(mediaPartHeader);
      const ui8MediaFooter = new TextEncoder().encode(mediaPartFooter);

      const blob = new Blob([
        ui8Metadata,
        ui8MediaHeader,
        new Uint8Array(arrayBuffer),
        ui8MediaFooter
      ], { type: "multipart/related" });

      xhr.send(blob);
    };

    reader.onerror = () => reject(new Error("Failed to read the selected PDF file."));
    reader.readAsArrayBuffer(file);
  });

  // 3. Update permissions so anyone with the link can view it
  try {
    const permissionResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        role: "reader",
        type: "anyone"
      })
    });

    if (!permissionResponse.ok) {
      const errText = await permissionResponse.text();
      console.warn("Could not set file permissions to public read on Google Drive:", errText);
    }
  } catch (err) {
    console.warn("Failed calling Google Drive permissions API:", err);
  }

  // 4. Return links for NotePilot (supporting Drive file fallbacks)
  const fileUrl = `https://drive.google.com/file/d/${fileId}/view?usp=drivesdk`;
  const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
  const previewUrl = `https://drive.google.com/file/d/${fileId}/preview`;

  return {
    storageProvider: "google-drive",
    storagePath: fileId,
    fileName: file.name,
    fileSize: file.size,
    fileUrl,
    downloadUrl,
    previewUrl
  };
}

export async function deletePdfFromStorage(storagePath, provider = "firebase") {
  if (!storagePath) {
    return;
  }

  if (provider === "google-drive") {
    const token = getGoogleDriveToken();
    if (!token) {
      console.warn("No active Google Drive session token. Skipping file deletion on Drive:", storagePath);
      return;
    }

    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${storagePath}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      if (!response.ok && response.status !== 404) {
        const errText = await response.text();
        console.warn(`Failed to delete Google Drive file ${storagePath}:`, errText);
      }
    } catch (error) {
      console.warn("Error calling Google Drive file delete API:", error);
    }
    return;
  }

  // Firebase Storage fallback for legacy notes
  if (!storage) {
    return;
  }

  try {
    await deleteObject(ref(storage, storagePath));
  } catch (error) {
    if (error?.code === "storage/object-not-found") {
      return;
    }
    throw new Error(error?.message || "The file could not be deleted from Firebase Storage.");
  }
}

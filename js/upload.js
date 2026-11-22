import { initShellPage, setLoading, showToast } from "./modules/app.js";
import { createNoteRecord } from "./modules/notes.js";
import { deletePdfFromStorage, uploadPdfToStorage } from "./modules/storage.js";
import { populateCommonSelects } from "./modules/ui.js";
import { parseTags, qs, summarizeFileSize } from "./modules/utils.js";

const form = qs("#uploadForm");
const fileInput = qs("#pdfFile");
const dropzone = qs("#dropzone");
const fileNameLabel = qs("#selectedFileName");
const progressBar = qs("#uploadProgressBar");
const progressText = qs("#uploadProgressText");
const storageStatusTitle = qs("#storageStatusTitle");
const storageStatusText = qs("#storageStatusText");

let activeUser = null;
let selectedFile = null;

function setStorageStatus(title, text) {
  storageStatusTitle.textContent = title;
  storageStatusText.textContent = text;
}

function updateProgress(value) {
  progressBar.style.width = `${Math.max(0, Math.min(100, value))}%`;
  progressText.textContent = `${value}% complete`;
}

function setSelectedFile(file) {
  selectedFile = file;

  if (!file) {
    fileNameLabel.textContent = "No file selected yet";
    return;
  }

  fileNameLabel.textContent = `${file.name} | ${summarizeFileSize(file.size)}`;
}

function wireDropzone() {
  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput.click();
    }
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add("is-dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove("is-dragover");
    });
  });

  dropzone.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];

    if (file) {
      fileInput.files = event.dataTransfer.files;
      setSelectedFile(file);
    }
  });
}

fileInput?.addEventListener("change", () => {
  setSelectedFile(fileInput.files?.[0] || null);
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!activeUser) {
    showToast("Sign in before uploading notes.", "error");
    return;
  }

  if (!selectedFile) {
    showToast("Choose a PDF file before uploading.", "error");
    return;
  }

  const formData = new FormData(form);
  let uploadMeta = null;

  try {
    setLoading(true, "Uploading PDF to Google Drive...");
    setStorageStatus("Uploading PDF", "Your file is being transferred to Google Drive and then synced to Firestore.");
    updateProgress(4);

    uploadMeta = await uploadPdfToStorage(selectedFile, activeUser, {
      onProgress: (value) => updateProgress(Math.max(value, 8))
    });

    updateProgress(92);
    setStorageStatus("Saving metadata", "Google Drive upload completed. Finalizing the note record in Firestore.");

    const noteId = await createNoteRecord(
      {
        title: String(formData.get("title") || ""),
        subject: String(formData.get("subject") || ""),
        semester: String(formData.get("semester") || ""),
        category: String(formData.get("category") || ""),
        description: String(formData.get("description") || ""),
        tags: parseTags(String(formData.get("tags") || ""))
      },
      uploadMeta,
      activeUser
    );

    updateProgress(100);
    setStorageStatus("Upload complete", "Your note is live and ready to be opened from the library.");
    showToast("Note uploaded successfully.", "success");
    window.location.href = `./note.html?id=${noteId}`;
  } catch (error) {
    if (uploadMeta?.storagePath) {
      try {
        await deletePdfFromStorage(uploadMeta.storagePath);
      } catch (cleanupError) {
        showToast(cleanupError.message, "error");
      }
    }

    setStorageStatus("Upload failed", error.message);
    showToast(error.message, "error");
  } finally {
    setLoading(false);
  }
});

initShellPage("upload", {
  requireAuth: true,
  onAuthResolved: async (user) => {
    if (!user) {
      return;
    }

    activeUser = user;
    populateCommonSelects();
    wireDropzone();
    setStorageStatus("Google Drive ready", "Choose a PDF and publish it directly to Google Drive with Firestore metadata.");
  }
});

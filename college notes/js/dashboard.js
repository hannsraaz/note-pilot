import { initShellPage, setLoading, showToast } from "./modules/app.js";
import { getUserProfile } from "./modules/auth.js";
import {
  deleteNoteRecord,
  fetchSavedNotes,
  fetchUserUploads,
  toggleSavedNote,
  updateNoteRecord
} from "./modules/notes.js";
import { deletePdfFromStorage } from "./modules/storage.js";
import {
  paintAvatar,
  populateCommonSelects,
  renderNotesGrid
} from "./modules/ui.js";
import { formatDate, formatNumber, getProviderLabel, parseTags, qs } from "./modules/utils.js";

const uploadsGrid = qs("#uploadsGrid");
const savedGrid = qs("#savedGrid");
const editModal = qs("#editModal");
const editForm = qs("#editNoteForm");
const closeEditModalButton = qs("#closeEditModal");
const cancelEditModalButton = qs("#cancelEditModal");

let activeUser = null;
let uploadsCache = [];

function updateProfileCard(user, profile) {
  const joinedLabel = profile?.createdAt ? formatDate(profile.createdAt) : "Recently";
  qs("#profileName").textContent = user.displayName || profile?.displayName || "Student Dashboard";
  qs("#profileEmail").textContent = user.email || profile?.email || "No email available";
  qs("#profileProvider").textContent = getProviderLabel(user);
  qs("#profileJoined").textContent = joinedLabel;
  qs("#profileTheme").textContent = (document.documentElement.getAttribute("data-theme") || "dark").replace(/^./, (match) => match.toUpperCase());
  paintAvatar(qs("#profileAvatar"), {
    name: user.displayName || profile?.displayName || "Student",
    photoURL: user.photoURL || profile?.photoURL
  });
}

function updateStats(uploads, savedNotes) {
  const totalLikes = uploads.reduce((sum, note) => sum + Number(note.likeCount || 0), 0);
  const totalDownloads = uploads.reduce((sum, note) => sum + Number(note.downloadCount || 0), 0);

  qs("#statUploads").textContent = formatNumber(uploads.length);
  qs("#statSaved").textContent = formatNumber(savedNotes.length);
  qs("#statLikes").textContent = formatNumber(totalLikes);
  qs("#statDownloads").textContent = formatNumber(totalDownloads);
}

function uploadActions(note) {
  return [
    { label: "View Details", href: `./note.html?id=${note.id}`, variant: "button-primary" },
    { label: "Edit", action: "edit", noteId: note.id, variant: "button-secondary" },
    { label: "Delete", action: "delete", noteId: note.id, variant: "button-ghost" }
  ];
}

function savedActions(note) {
  return [
    { label: "View Details", href: `./note.html?id=${note.id}`, variant: "button-primary" },
    { label: "Remove Save", action: "unsave", noteId: note.id, variant: "button-secondary" }
  ];
}

function openEditModal(note) {
  qs("#editNoteId").value = note.id;
  qs("#editTitle").value = note.title || "";
  qs("#editSubject").value = note.subject || "";
  qs("#editSemester").value = note.semester || "";
  qs("#editCategory").value = note.category || "";
  qs("#editDescription").value = note.description || "";
  qs("#editTags").value = (note.tags || []).join(", ");
  editModal.classList.add("is-open");
  editModal.setAttribute("aria-hidden", "false");
}

function closeEditModal() {
  editModal.classList.remove("is-open");
  editModal.setAttribute("aria-hidden", "true");
}

async function loadDashboard(user) {
  const [profile, uploads, savedNotes] = await Promise.all([
    getUserProfile(user.uid),
    fetchUserUploads(user.uid),
    fetchSavedNotes(user.uid)
  ]);

  uploadsCache = uploads;
  updateProfileCard(user, profile);
  updateStats(uploads, savedNotes);

  renderNotesGrid(uploadsGrid, uploads, {
    emptyTitle: "You have not uploaded anything yet",
    emptyText: "Publish your first PDF note to start building your collection.",
    actionsBuilder: uploadActions
  });

  renderNotesGrid(savedGrid, savedNotes, {
    emptyTitle: "No saved notes yet",
    emptyText: "Browse the library and bookmark useful notes to keep them here.",
    actionsBuilder: savedActions
  });
}

qs("#uploadsGrid")?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-note-action]");

  if (!button || !activeUser) {
    return;
  }

  const note = uploadsCache.find((item) => item.id === button.dataset.noteId);

  if (!note) {
    return;
  }

  if (button.dataset.noteAction === "edit") {
    openEditModal(note);
    return;
  }

  if (button.dataset.noteAction === "delete") {
    const confirmed = window.confirm("Delete this note? Its attached file will also be deleted when available.");

    if (!confirmed) {
      return;
    }

    try {
      setLoading(true, "Deleting your note...");

      try {
        await deletePdfFromStorage(note.storagePath, note.storageProvider);
      } catch (storageError) {
        showToast(`${storageError.message} The Firestore note will still be removed.`, "error");
      }

      await deleteNoteRecord(note.id, activeUser.uid);
      showToast("Note deleted successfully.", "success");
      await loadDashboard(activeUser);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  }
});

qs("#savedGrid")?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-note-action='unsave']");

  if (!button || !activeUser) {
    return;
  }

  try {
    setLoading(true, "Updating your saved notes...");
    await toggleSavedNote(button.dataset.noteId, activeUser.uid);
    await loadDashboard(activeUser);
    showToast("Saved note removed.", "success");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setLoading(false);
  }
});

editForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!activeUser) {
    return;
  }

  const formData = new FormData(editForm);

  try {
    setLoading(true, "Saving note changes...");
    await updateNoteRecord(
      String(formData.get("noteId")),
      {
        title: String(formData.get("title") || ""),
        subject: String(formData.get("subject") || ""),
        semester: String(formData.get("semester") || ""),
        category: String(formData.get("category") || ""),
        description: String(formData.get("description") || ""),
        tags: parseTags(String(formData.get("tags") || ""))
      },
      activeUser.uid
    );
    closeEditModal();
    await loadDashboard(activeUser);
    showToast("Note updated successfully.", "success");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setLoading(false);
  }
});

closeEditModalButton?.addEventListener("click", closeEditModal);
cancelEditModalButton?.addEventListener("click", closeEditModal);
editModal?.addEventListener("click", (event) => {
  if (event.target === editModal) {
    closeEditModal();
  }
});

document.addEventListener("themechange", () => {
  qs("#profileTheme").textContent = (document.documentElement.getAttribute("data-theme") || "dark").replace(/^./, (match) => match.toUpperCase());
});

initShellPage("dashboard", {
  requireAuth: true,
  onAuthResolved: async (user) => {
    if (!user) {
      return;
    }

    activeUser = user;
    populateCommonSelects();

    try {
      await loadDashboard(user);
    } catch (error) {
      showToast(error.message, "error");
    }
  }
});

import { initShellPage, setLoading, showToast } from "./modules/app.js";
import {
  addCommentToNote,
  deleteCommentFromNote,
  fetchComments,
  fetchNoteById,
  fetchRelatedNotes,
  getUserEngagementState,
  recordNoteDownload,
  toggleLikeNote,
  toggleSavedNote
} from "./modules/notes.js";
import {
  paintAvatar,
  renderComments,
  renderNotesGrid
} from "./modules/ui.js";
import { escapeHtml, formatDate, getNoteFileLinks, getQueryParam, qs } from "./modules/utils.js";

const noteId = getQueryParam("id");
const likeButton = qs("#likeButton");
const saveButton = qs("#saveButton");
const downloadButton = qs("#downloadPdfButton");
const openButton = qs("#openPdfButton");
const previewFrame = qs("#notePreviewFrame");
const previewFallback = qs("#previewFallback");
const relatedNotesGrid = qs("#relatedNotesGrid");
const commentsList = qs("#commentsList");
const commentForm = qs("#commentForm");
const commentText = qs("#commentText");

let activeUser = null;
let currentNote = null;
let currentEngagement = { liked: false, saved: false };

function updateEngagementButtons() {
  likeButton.textContent = currentEngagement.liked ? "Liked" : "Like";
  saveButton.textContent = currentEngagement.saved ? "Saved" : "Bookmark";
}

function updateNoteUI(note) {
  qs("#noteBadge").textContent = `${note.category} | ${note.semester}`;
  qs("#noteTitle").textContent = note.title;
  qs("#noteDescription").textContent = note.description;
  qs("#detailSubject").textContent = note.subject;
  qs("#detailSemester").textContent = note.semester;
  qs("#detailCategory").textContent = note.category;
  qs("#detailDate").textContent = formatDate(note.createdAt);
  qs("#detailLikes").textContent = String(note.likeCount || 0);
  qs("#detailBookmarks").textContent = String(note.bookmarkCount || 0);
  qs("#detailDownloads").textContent = String(note.downloadCount || 0);
  qs("#uploaderName").textContent = note.uploaderName || "Student";
  qs("#uploaderEmail").textContent = note.uploaderEmail || "Campus uploader";
  paintAvatar(qs("#uploaderAvatar"), {
    name: note.uploaderName || "Student",
    photoURL: note.uploaderPhotoURL
  });

  qs("#noteTags").innerHTML = (note.tags || [])
    .map((tag) => `<span class="tag-chip">#${escapeHtml(tag)}</span>`)
    .join("");

  const fileLinks = getNoteFileLinks(note);

  openButton.href = fileLinks.openUrl || "#";
  downloadButton.href = fileLinks.downloadUrl || "#";

  if (fileLinks.previewUrl) {
    previewFrame.src = fileLinks.previewUrl;
    previewFrame.classList.remove("hidden");
    previewFallback.classList.add("hidden");
  } else {
    previewFrame.removeAttribute("src");
    previewFrame.classList.add("hidden");
    previewFallback.classList.remove("hidden");
  }
}

async function refreshCommentList() {
  const comments = await fetchComments(noteId);
  renderComments(commentsList, comments, activeUser?.uid);
}

async function refreshEngagementState() {
  if (!currentNote) {
    return;
  }

  currentEngagement = activeUser
    ? await getUserEngagementState(noteId, activeUser.uid)
    : { liked: false, saved: false };
  updateEngagementButtons();
}

function updateCommentComposerState() {
  if (!activeUser) {
    commentText.placeholder = "Login to join the discussion around this note.";
  } else {
    commentText.placeholder = "Share context, corrections, or extra tips for this note.";
  }
}

async function loadNotePage() {
  if (!noteId) {
    throw new Error("No note ID was provided.");
  }

  const note = await fetchNoteById(noteId);

  if (!note) {
    throw new Error("This note could not be found.");
  }

  currentNote = note;
  updateNoteUI(note);
  await refreshEngagementState();
  await refreshCommentList();

  const related = await fetchRelatedNotes(note);
  renderNotesGrid(relatedNotesGrid, related, {
    emptyTitle: "No related notes yet",
    emptyText: "Upload more notes in this subject or semester to build a richer recommendation set."
  });
}

likeButton?.addEventListener("click", async () => {
  if (!activeUser) {
    window.location.href = `./login.html?redirect=${encodeURIComponent(`note.html?id=${noteId}`)}`;
    return;
  }

  try {
    setLoading(true, "Updating likes...");
    currentEngagement.liked = await toggleLikeNote(noteId, activeUser.uid);
    currentNote = await fetchNoteById(noteId);
    updateNoteUI(currentNote);
    updateEngagementButtons();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setLoading(false);
  }
});

saveButton?.addEventListener("click", async () => {
  if (!activeUser) {
    window.location.href = `./login.html?redirect=${encodeURIComponent(`note.html?id=${noteId}`)}`;
    return;
  }

  try {
    setLoading(true, "Updating bookmarks...");
    currentEngagement.saved = await toggleSavedNote(noteId, activeUser.uid);
    currentNote = await fetchNoteById(noteId);
    updateNoteUI(currentNote);
    updateEngagementButtons();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setLoading(false);
  }
});

openButton?.addEventListener("click", (event) => {
  if (getNoteFileLinks(currentNote || {}).openUrl) {
    return;
  }

  event.preventDefault();
  showToast("This note does not have an attached PDF yet.", "error");
});

downloadButton?.addEventListener("click", async (event) => {
  if (!getNoteFileLinks(currentNote || {}).downloadUrl) {
    event.preventDefault();
    showToast("This note does not have a downloadable PDF yet.", "error");
    return;
  }

  try {
    await recordNoteDownload(noteId);
  } catch (error) {
    showToast(error.message, "error");
  }
});

commentForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!activeUser) {
    window.location.href = `./login.html?redirect=${encodeURIComponent(`note.html?id=${noteId}`)}`;
    return;
  }

  try {
    setLoading(true, "Posting your comment...");
    await addCommentToNote(noteId, activeUser, commentText.value);
    commentText.value = "";
    currentNote = await fetchNoteById(noteId);
    updateNoteUI(currentNote);
    await refreshCommentList();
    showToast("Comment added.", "success");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setLoading(false);
  }
});

commentsList?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-comment-action='delete']");

  if (!button || !activeUser) {
    return;
  }

  try {
    setLoading(true, "Removing your comment...");
    await deleteCommentFromNote(noteId, button.dataset.commentId, activeUser.uid);
    currentNote = await fetchNoteById(noteId);
    updateNoteUI(currentNote);
    await refreshCommentList();
    showToast("Comment deleted.", "success");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setLoading(false);
  }
});

initShellPage("home", {
  onAuthResolved: async (user) => {
    activeUser = user;
    updateCommentComposerState();

    try {
      await loadNotePage();
    } catch (error) {
      showToast(error.message, "error");
      qs(".note-page").innerHTML = `
        <div class="empty-state">
          <h3>Unable to load this note</h3>
          <p>${error.message}</p>
        </div>
      `;
    }
  }
});

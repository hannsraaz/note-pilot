import { config } from "./config.js";
import { NAV_ITEMS, CATEGORIES, SEMESTERS } from "./constants.js";
import {
  escapeHtml,
  formatDate,
  formatNumber,
  getInitials,
  getNoteFileLinks,
  summarizeFileSize,
  truncate
} from "./utils.js";

let toastRoot;
let loadingOverlay;
let drawerBackdrop;

function ensureUiScaffold() {
  if (!toastRoot) {
    toastRoot = document.createElement("div");
    toastRoot.className = "toast-stack";
    document.body.append(toastRoot);
  }

  if (!loadingOverlay) {
    loadingOverlay = document.createElement("div");
    loadingOverlay.className = "loading-overlay";
    loadingOverlay.innerHTML = `
      <div class="loading-card">
        <div class="spinner"></div>
        <h3>Working on it</h3>
        <p id="loadingMessage">Please wait a moment.</p>
      </div>
    `;
    document.body.append(loadingOverlay);
  }

  if (!drawerBackdrop) {
    drawerBackdrop = document.createElement("button");
    drawerBackdrop.type = "button";
    drawerBackdrop.className = "mobile-drawer-backdrop";
    drawerBackdrop.setAttribute("aria-label", "Close navigation drawer");
    drawerBackdrop.addEventListener("click", closeMobileDrawer);
    document.body.append(drawerBackdrop);
  }
}

export function initTheme() {
  ensureUiScaffold();
  const stored = window.localStorage.getItem("notepilot-theme");
  const theme = stored || config.app.defaultTheme || "dark";
  document.documentElement.setAttribute("data-theme", theme);
  updateThemeButtons(theme);
  document.dispatchEvent(new CustomEvent("themechange", { detail: { theme } }));
}

function updateThemeButtons(theme) {
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.setAttribute("title", `Current theme: ${theme}`);
    button.setAttribute("aria-label", `Current theme: ${theme}`);
  });
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  window.localStorage.setItem("notepilot-theme", next);
  updateThemeButtons(next);
  document.dispatchEvent(new CustomEvent("themechange", { detail: { theme: next } }));
  return next;
}

export function showToast(message, type = "info") {
  ensureUiScaffold();
  const toast = document.createElement("article");
  toast.className = `toast ${type === "success" ? "is-success" : ""} ${type === "error" ? "is-error" : ""}`.trim();
  toast.textContent = message;
  toastRoot.append(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 4200);
}

export function setLoading(isVisible, message = "Please wait a moment.") {
  ensureUiScaffold();
  loadingOverlay.classList.toggle("is-visible", isVisible);
  const label = loadingOverlay.querySelector("#loadingMessage");

  if (label) {
    label.textContent = message;
  }
}

function navMarkup(activeKey) {
  return NAV_ITEMS.map((item) => `
    <a class="nav-link ${item.key === activeKey ? "is-active" : ""}" href="${item.href}">
      <strong>${item.label}</strong>
      <span>${item.description}</span>
    </a>
  `).join("");
}

export function renderShell(activeKey) {
  ensureUiScaffold();

  const sidebarHost = document.getElementById("sidebarShell");
  const topbarHost = document.getElementById("topbarShell");

  if (sidebarHost) {
    sidebarHost.innerHTML = `
      <aside class="sidebar">
        <a class="brand-lockup" href="./index.html">
          <img src="./assets/logo.svg" alt="${config.app.name} logo">
          <span>${config.app.name}</span>
        </a>
        <nav class="sidebar-nav">
          ${navMarkup(activeKey)}
        </nav>
        <div class="sidebar-footer">
          <article class="sidebar-cta">
            <h3>Ready to publish?</h3>
            <p>Upload polished PDF notes and help the next student move faster.</p>
            <a class="button button-primary button-block" href="./upload.html">Start Upload</a>
          </article>
        </div>
      </aside>
    `;
  }

  if (topbarHost) {
    topbarHost.innerHTML = `
      <div class="topbar">
        <div class="topbar-left">
          <button id="mobileNavButton" class="mobile-nav-button" type="button" aria-label="Open navigation">|||</button>
          <div class="topbar-status">Live on Firebase</div>
        </div>
        <div class="topbar-right">
          <div class="topbar-actions">
            <button class="theme-toggle" data-theme-toggle type="button"></button>
            <a id="authCtaPrimary" class="button button-secondary" href="./login.html">Login</a>
            <button id="authCtaSecondary" class="button button-ghost hidden" type="button" data-auth-action="logout">Logout</button>
          </div>
          <a id="userPill" class="user-pill hidden" href="./dashboard.html">
            <div id="shellUserAvatar" class="profile-avatar"></div>
            <div class="user-pill-copy">
              <strong id="shellUserName">Guest</strong>
              <span id="shellUserMeta">Sign in to save notes</span>
            </div>
          </a>
        </div>
      </div>
    `;
  }
}

function closeMobileDrawer() {
  document.getElementById("sidebarShell")?.classList.remove("is-open");
  drawerBackdrop?.classList.remove("is-visible");
}

function openMobileDrawer() {
  document.getElementById("sidebarShell")?.classList.add("is-open");
  drawerBackdrop?.classList.add("is-visible");
}

export function bindShellEvents({ onLogout } = {}) {
  ensureUiScaffold();

  document.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-theme-toggle], #mobileNavButton, [data-auth-action='logout']");

    if (!target) {
      return;
    }

    if (target.matches("[data-theme-toggle]")) {
      toggleTheme();
      return;
    }

    if (target.id === "mobileNavButton") {
      openMobileDrawer();
      return;
    }

    if (target.dataset.authAction === "logout" && typeof onLogout === "function") {
      await onLogout();
      closeMobileDrawer();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 980) {
      closeMobileDrawer();
    }
  });
}

export function paintAvatar(element, { name, photoURL }) {
  if (!element) {
    return;
  }

  element.textContent = "";
  element.style.backgroundImage = "";
  element.style.backgroundSize = "";
  element.style.backgroundPosition = "";

  if (photoURL) {
    element.style.backgroundImage = `url('${photoURL}')`;
    element.style.backgroundSize = "cover";
    element.style.backgroundPosition = "center";
    return;
  }

  element.textContent = getInitials(name);
}

export function updateAuthShell(user) {
  const primaryCta = document.getElementById("authCtaPrimary");
  const secondaryCta = document.getElementById("authCtaSecondary");
  const userPill = document.getElementById("userPill");
  const userName = document.getElementById("shellUserName");
  const userMeta = document.getElementById("shellUserMeta");
  const userAvatar = document.getElementById("shellUserAvatar");

  if (!primaryCta || !secondaryCta || !userPill || !userName || !userMeta || !userAvatar) {
    return;
  }

  if (!user) {
    primaryCta.classList.remove("hidden");
    primaryCta.href = "./login.html";
    primaryCta.textContent = "Login";
    secondaryCta.classList.add("hidden");
    userPill.classList.add("hidden");
    return;
  }

  primaryCta.classList.remove("hidden");
  primaryCta.href = "./dashboard.html";
  primaryCta.textContent = "Dashboard";
  secondaryCta.classList.remove("hidden");
  userPill.classList.remove("hidden");
  userName.textContent = user.displayName || "Student";
  userMeta.textContent = user.email || "Signed in";
  paintAvatar(userAvatar, { name: user.displayName || "Student", photoURL: user.photoURL });
}

export function populateSelect(selectElement, values, options = {}) {
  if (!selectElement) {
    return;
  }

  const placeholder = options.includeAll ? `<option value="all">${options.includeAll}</option>` : "";
  selectElement.innerHTML = `${placeholder}${values
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join("")}`;
}

export function renderSkeletons(container, count = 3) {
  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="skeleton-grid">
      ${Array.from({ length: count }, () => `<div class="skeleton-card"></div>`).join("")}
    </div>
  `;
}

function actionsMarkup(actions = []) {
  if (!actions.length) {
    return `<div class="hero-actions"><a class="button button-primary" href="#">Open</a></div>`;
  }

  return `
    <div class="hero-actions">
      ${actions.map((action) => {
        if (action.href) {
          return `<a class="button ${action.variant || "button-secondary"}" href="${action.href}" ${action.external ? 'target="_blank" rel="noopener noreferrer"' : ""}>${escapeHtml(action.label)}</a>`;
        }

        return `<button class="button ${action.variant || "button-secondary"}" type="button" data-note-action="${escapeHtml(action.action)}" data-note-id="${escapeHtml(action.noteId || "")}">${escapeHtml(action.label)}</button>`;
      }).join("")}
    </div>
  `;
}

export function renderNoteCard(note, options = {}) {
  const tags = (note.tags || []).slice(0, 3);
  const fileLinks = getNoteFileLinks(note);
  const actions = typeof options.actionsBuilder === "function"
    ? options.actionsBuilder(note)
    : [
        { label: "View Details", href: `./note.html?id=${note.id}`, variant: "button-primary" },
        ...(fileLinks.openUrl ? [{ label: "Open PDF", href: fileLinks.openUrl, variant: "button-secondary", external: true }] : [])
      ];

  const avatarStyle = note.uploaderPhotoURL
    ? `style="background-image: url('${escapeHtml(note.uploaderPhotoURL)}'); background-size: cover; background-position: center;"`
    : "";
  const avatarContent = note.uploaderPhotoURL
    ? ""
    : escapeHtml(getInitials(note.uploaderName || "Student"));

  return `
    <article class="card note-card">
      <div class="note-card-top">
        <span class="badge-soft">${escapeHtml(note.category || "Notes")}</span>
        <span class="tag-chip">${escapeHtml(note.semester || "Semester")}</span>
      </div>
      <div>
        <h3>${escapeHtml(note.title || "Untitled note")}</h3>
        <p>${escapeHtml(truncate(note.description || "No description added yet.", 142))}</p>
      </div>
      <div class="note-meta">
        <span>${escapeHtml(note.subject || "Subject")}</span>
        <span>${summarizeFileSize(note.fileSize)}</span>
        <span>${formatDate(note.createdAt)}</span>
      </div>
      <div class="meta-tags">
        ${tags.length ? tags.map((tag) => `<span>#${escapeHtml(tag)}</span>`).join("") : `<span>No tags</span>`}
      </div>
      <div class="note-footer">
        <div class="note-author">
          <div class="profile-avatar" ${avatarStyle}>${avatarContent}</div>
          <div class="note-author-copy">
            <strong>${escapeHtml(note.uploaderName || "Student")}</strong>
            <span>${escapeHtml(note.uploaderEmail || "Campus uploader")}</span>
          </div>
        </div>
        <div class="note-stats">
          <span>${formatNumber(note.likeCount)} likes</span>
          <span>${formatNumber(note.downloadCount)} downloads</span>
        </div>
      </div>
      ${actionsMarkup(actions)}
    </article>
  `;
}

export function renderNotesGrid(container, notes, options = {}) {
  if (!container) {
    return;
  }

  if (!notes.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>${escapeHtml(options.emptyTitle || "No notes found")}</h3>
        <p>${escapeHtml(options.emptyText || "Try another search or upload the first note for this space.")}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = notes.map((note) => renderNoteCard(note, options)).join("");
}

export function renderComments(container, comments, currentUserId) {
  if (!container) {
    return;
  }

  if (!comments.length) {
    container.innerHTML = `
      <div class="empty-state compact">
        <h3>No comments yet</h3>
        <p>Be the first person to add context or study tips for this note.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = comments
    .map((comment) => `
      <article class="card comment-item">
        <div class="comment-item-header">
          <div class="comment-author">
            <div class="profile-avatar">${escapeHtml(getInitials(comment.userName || "Student"))}</div>
            <div>
              <strong>${escapeHtml(comment.userName || "Student")}</strong>
              <p class="muted-copy">${formatDate(comment.createdAt)}</p>
            </div>
          </div>
          ${comment.userId === currentUserId ? `<button class="button button-ghost" type="button" data-comment-action="delete" data-comment-id="${escapeHtml(comment.id)}">Delete</button>` : ""}
        </div>
        <div class="comment-item-body">${escapeHtml(comment.text || "")}</div>
      </article>
    `)
    .join("");
}

export function setStandaloneThemeButton() {
  const button = document.getElementById("standaloneThemeToggle");

  if (button) {
    button.setAttribute("data-theme-toggle", "true");
  }
}

export function populateCommonSelects() {
  populateSelect(document.getElementById("semesterFilter"), SEMESTERS, { includeAll: "All Semesters" });
  populateSelect(document.getElementById("categoryFilter"), CATEGORIES, { includeAll: "All Categories" });
  populateSelect(document.getElementById("uploadSemester"), SEMESTERS);
  populateSelect(document.getElementById("uploadCategory"), CATEGORIES);
  populateSelect(document.getElementById("editSemester"), SEMESTERS);
  populateSelect(document.getElementById("editCategory"), CATEGORIES);
}

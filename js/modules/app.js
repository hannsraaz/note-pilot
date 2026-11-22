import { firebaseConfigured, getConfigWarnings } from "./config.js";
import { logoutUser, observeAuthState } from "./auth.js";
import {
  bindShellEvents,
  initTheme,
  renderShell,
  setLoading,
  setStandaloneThemeButton,
  showToast,
  updateAuthShell
} from "./ui.js";

let warningsShown = false;

function showConfigWarningsOnce() {
  if (warningsShown) {
    return;
  }

  getConfigWarnings().forEach((warning) => {
    showToast(warning, "error");
  });

  warningsShown = true;
}

function getCurrentPageUrl() {
  const fileName = window.location.pathname.split("/").pop() || "index.html";
  return `${fileName}${window.location.search}`;
}

export function initShellPage(pageKey, { requireAuth = false, onAuthResolved } = {}) {
  initTheme();
  renderShell(pageKey);
  bindShellEvents({
    onLogout: async () => {
      try {
        await logoutUser();
        showToast("You have been logged out.", "success");
        window.location.href = "./login.html";
      } catch (error) {
        showToast(error.message, "error");
      }
    }
  });

  showConfigWarningsOnce();

  return observeAuthState(async (user) => {
    updateAuthShell(user);

    if (requireAuth && !user && firebaseConfigured) {
      const redirect = encodeURIComponent(getCurrentPageUrl());
      window.location.href = `./login.html?redirect=${redirect}`;
      return;
    }

    await onAuthResolved?.(user);
  });
}

export function initStandalonePage({ redirectIfAuthenticated = false, onAuthResolved } = {}) {
  initTheme();
  setStandaloneThemeButton();
  bindShellEvents();
  showConfigWarningsOnce();

  return observeAuthState(async (user) => {
    if (redirectIfAuthenticated && user && firebaseConfigured) {
      window.location.href = "./dashboard.html";
      return;
    }

    await onAuthResolved?.(user);
  });
}

export { setLoading, showToast };

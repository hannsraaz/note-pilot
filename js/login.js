import { initStandalonePage, setLoading, showToast } from "./modules/app.js";
import {
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail
} from "./modules/auth.js";
import { getQueryParam, qsa } from "./modules/utils.js";

const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const googleButton = document.getElementById("googleAuthButton");
const heading = document.getElementById("authHeading");
const subheading = document.getElementById("authSubheading");

function getRedirectTarget() {
  const redirect = getQueryParam("redirect");
  if (!redirect) {
    return "./dashboard.html";
  }

  try {
    const normalized = new URL(redirect, window.location.origin);
    if (normalized.origin !== window.location.origin) {
      return "./dashboard.html";
    }

    return `${normalized.pathname}${normalized.search}${normalized.hash}`;
  } catch {
    return "./dashboard.html";
  }
}

function showAuthTab(tab) {
  const isLogin = tab === "login";
  loginForm.classList.toggle("is-visible", isLogin);
  signupForm.classList.toggle("is-visible", !isLogin);

  qsa("[data-auth-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.authTab === tab);
  });

  heading.textContent = isLogin ? "Login to your account" : "Create your NotePilot account";
  subheading.textContent = isLogin
    ? "Continue to your dashboard, saved notes, and uploads."
    : "Create a profile to start sharing and saving notes.";
}

qsa("[data-auth-tab]").forEach((button) => {
  button.addEventListener("click", () => showAuthTab(button.dataset.authTab));
});

googleButton?.addEventListener("click", async () => {
  try {
    setLoading(true, "Signing you in with Google...");
    await signInWithGoogle();
    window.location.href = getRedirectTarget();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setLoading(false);
  }
});

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(loginForm);

  try {
    setLoading(true, "Logging you in...");
    await signInWithEmail({
      email: formData.get("email"),
      password: formData.get("password")
    });
    window.location.href = getRedirectTarget();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setLoading(false);
  }
});

signupForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(signupForm);
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (password !== confirmPassword) {
    showToast("Passwords do not match. Please re-enter them.", "error");
    return;
  }

  try {
    setLoading(true, "Creating your account...");
    await signUpWithEmail({
      name: String(formData.get("name") || ""),
      email: String(formData.get("email") || ""),
      password
    });
    window.location.href = getRedirectTarget();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setLoading(false);
  }
});

initStandalonePage({
  redirectIfAuthenticated: true
});

/**
 * NotePilot Cloudflare Worker Backend API
 * Securely proxies Firebase Auth, Firestore, and client configuration.
 * All API keys remain isolated in Cloudflare secrets and are never sent to the client.
 */

import { getCorsHeaders, handleOptions, jsonResponse } from "./cors.js";
import { checkRateLimit } from "./ratelimit.js";
import {
  addComment,
  createNote,
  deleteComment,
  deleteNote,
  getNoteById,
  getUserEngagement,
  getUserProfile,
  getUserSavedNotes,
  listComments,
  queryNotes,
  recordDownload,
  refreshIdToken,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  toggleLikeNote,
  toggleSaveNote,
  updateNote,
  verifyUserToken
} from "./firebase.js";

async function parseBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function extractBearerToken(request) {
  const authHeader = request.headers.get("Authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    // 1. Handle CORS Preflight
    if (request.method === "OPTIONS") {
      return handleOptions(request, env);
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // 2. Health and Public Config Routes (available even before secret keys are set)
    if (path === "/" || path === "/api/health") {
      return jsonResponse(
        {
          status: "ok",
          service: "NotePilot API Gateway",
          timestamp: new Date().toISOString()
        },
        200,
        request,
        env
      );
    }

    if (path === "/api/config" && method === "GET") {
      return jsonResponse(
        {
          appName: env.APP_NAME || "NotePilot",
          supportEmail: env.SUPPORT_EMAIL || "support@example.com",
          defaultTheme: env.DEFAULT_THEME || "dark",
          googleDriveClientId: env.GOOGLE_DRIVE_CLIENT_ID || ""
        },
        200,
        request,
        env
      );
    }

    // 3. Validate Firebase API Key presence for database and auth endpoints
    if (!env.FIREBASE_API_KEY && path.startsWith("/api/")) {
      return jsonResponse(
        {
          error: "Backend is missing FIREBASE_API_KEY secret. Run `wrangler secret put FIREBASE_API_KEY`."
        },
        500,
        request,
        env
      );
    }

    // 4. Apply Rate Limiting
    const isAuthRoute = path.startsWith("/api/auth");
    const rateLimit = checkRateLimit(request, isAuthRoute ? 15 : 120, 60000);
    if (!rateLimit.allowed) {
      return jsonResponse(
        {
          error: `Too many requests. Please wait ${rateLimit.resetInSeconds}s before trying again.`
        },
        429,
        request,
        env,
        { "Retry-After": String(rateLimit.resetInSeconds) }
      );
    }

    try {


      // ----------------------------------------------------
      // Auth Routes
      // ----------------------------------------------------
      if (path === "/api/auth/register" && method === "POST") {
        const body = await parseBody(request);
        const email = String(body.email || "").trim();
        const password = String(body.password || "");
        const name = String(body.name || "").trim();

        if (!email || !password) {
          return jsonResponse({ error: "Email and password are required." }, 400, request, env);
        }
        if (password.length < 6) {
          return jsonResponse({ error: "Password must be at least 6 characters long." }, 400, request, env);
        }

        const authResult = await signUpWithEmail(email, password, name, env);
        return jsonResponse(authResult, 201, request, env);
      }

      if (path === "/api/auth/login" && method === "POST") {
        const body = await parseBody(request);
        const email = String(body.email || "").trim();
        const password = String(body.password || "");

        if (!email || !password) {
          return jsonResponse({ error: "Email and password are required." }, 400, request, env);
        }

        const authResult = await signInWithEmail(email, password, env);
        return jsonResponse(authResult, 200, request, env);
      }

      if (path === "/api/auth/google" && method === "POST") {
        const body = await parseBody(request);
        const idToken = body.idToken;

        if (!idToken) {
          return jsonResponse({ error: "Google ID token is required." }, 400, request, env);
        }

        const origin = request.headers.get("Origin") || "http://localhost";
        const authResult = await signInWithGoogle(idToken, origin, env);
        return jsonResponse(authResult, 200, request, env);
      }

      if (path === "/api/auth/refresh" && method === "POST") {
        const body = await parseBody(request);
        const refreshToken = body.refreshToken;
        if (!refreshToken) {
          return jsonResponse({ error: "Refresh token is required." }, 400, request, env);
        }

        const result = await refreshIdToken(refreshToken, env);
        return jsonResponse(result, 200, request, env);
      }

      if (path === "/api/auth/me" && method === "GET") {
        const token = extractBearerToken(request);
        if (!token) {
          return jsonResponse({ user: null }, 200, request, env);
        }

        const user = await verifyUserToken(token, env);
        return jsonResponse({ user }, 200, request, env);
      }

      if (path === "/api/auth/logout" && method === "POST") {
        return jsonResponse({ success: true }, 200, request, env);
      }

      // ----------------------------------------------------
      // User Profile Routes
      // ----------------------------------------------------
      const userProfileMatch = path.match(/^\/api\/users\/([^/]+)$/);
      if (userProfileMatch && method === "GET") {
        const userId = userProfileMatch[1];
        const profile = await getUserProfile(userId, env);
        return jsonResponse(profile || {}, 200, request, env);
      }

      const userUploadsMatch = path.match(/^\/api\/users\/([^/]+)\/uploads$/);
      if (userUploadsMatch && method === "GET") {
        const userId = userUploadsMatch[1];
        const uploads = await queryNotes({ uploaderId: userId }, env);
        return jsonResponse(uploads, 200, request, env);
      }

      const userSavedMatch = path.match(/^\/api\/users\/([^/]+)\/saved$/);
      if (userSavedMatch && method === "GET") {
        const userId = userSavedMatch[1];
        const token = extractBearerToken(request);
        const user = await verifyUserToken(token, env);

        if (!user || user.uid !== userId) {
          return jsonResponse({ error: "Unauthorized access to saved notes." }, 401, request, env);
        }

        const savedNotes = await getUserSavedNotes(userId, env);
        return jsonResponse(savedNotes, 200, request, env);
      }

      // ----------------------------------------------------
      // Notes Routes
      // ----------------------------------------------------
      if (path === "/api/notes" && method === "GET") {
        const filter = url.searchParams.get("filter") || "";
        const semester = url.searchParams.get("semester") || "";
        const category = url.searchParams.get("category") || "";
        const search = url.searchParams.get("search") || "";
        const limit = parseInt(url.searchParams.get("limit") || "30", 10);
        const uploaderId = url.searchParams.get("uploaderId") || "";

        const notes = await queryNotes({ filter, semester, category, search, limit, uploaderId }, env);
        return jsonResponse(notes, 200, request, env);
      }

      if (path === "/api/notes" && method === "POST") {
        const token = extractBearerToken(request);
        const user = await verifyUserToken(token, env);
        if (!user) {
          return jsonResponse({ error: "Sign in before uploading notes." }, 401, request, env);
        }

        const body = await parseBody(request);
        if (!body.note || !body.uploadMeta) {
          return jsonResponse({ error: "Note metadata and upload metadata are required." }, 400, request, env);
        }

        const created = await createNote(body.note, body.uploadMeta, user, env);
        return jsonResponse({ id: created.id, ...created }, 201, request, env);
      }

      // Single Note Routes: /api/notes/:id
      const singleNoteMatch = path.match(/^\/api\/notes\/([^/]+)$/);
      if (singleNoteMatch) {
        const noteId = singleNoteMatch[1];

        if (method === "GET") {
          const note = await getNoteById(noteId, env);
          if (!note) {
            return jsonResponse({ error: "Note not found." }, 404, request, env);
          }
          return jsonResponse(note, 200, request, env);
        }

        if (method === "PUT") {
          const token = extractBearerToken(request);
          const user = await verifyUserToken(token, env);
          if (!user) {
            return jsonResponse({ error: "Unauthorized." }, 401, request, env);
          }

          const body = await parseBody(request);
          await updateNote(noteId, body, user.uid, env);
          return jsonResponse({ success: true }, 200, request, env);
        }

        if (method === "DELETE") {
          const token = extractBearerToken(request);
          const user = await verifyUserToken(token, env);
          if (!user) {
            return jsonResponse({ error: "Unauthorized." }, 401, request, env);
          }

          await deleteNote(noteId, user.uid, env);
          return jsonResponse({ success: true }, 200, request, env);
        }
      }

      // Engagement Routes: /api/notes/:id/engagement, /like, /save, /download
      const engagementMatch = path.match(/^\/api\/notes\/([^/]+)\/engagement$/);
      if (engagementMatch && method === "GET") {
        const noteId = engagementMatch[1];
        const token = extractBearerToken(request);
        const user = token ? await verifyUserToken(token, env) : null;
        const engagement = await getUserEngagement(noteId, user?.uid, env);
        return jsonResponse(engagement, 200, request, env);
      }

      const likeMatch = path.match(/^\/api\/notes\/([^/]+)\/like$/);
      if (likeMatch && method === "POST") {
        const noteId = likeMatch[1];
        const token = extractBearerToken(request);
        const user = await verifyUserToken(token, env);
        if (!user) {
          return jsonResponse({ error: "Sign in before liking notes." }, 401, request, env);
        }

        const liked = await toggleLikeNote(noteId, user.uid, env);
        return jsonResponse({ liked }, 200, request, env);
      }

      const saveMatch = path.match(/^\/api\/notes\/([^/]+)\/save$/);
      if (saveMatch && method === "POST") {
        const noteId = saveMatch[1];
        const token = extractBearerToken(request);
        const user = await verifyUserToken(token, env);
        if (!user) {
          return jsonResponse({ error: "Sign in before saving notes." }, 401, request, env);
        }

        const saved = await toggleSaveNote(noteId, user.uid, env);
        return jsonResponse({ saved }, 200, request, env);
      }

      const downloadMatch = path.match(/^\/api\/notes\/([^/]+)\/download$/);
      if (downloadMatch && method === "POST") {
        const noteId = downloadMatch[1];
        await recordDownload(noteId, env);
        return jsonResponse({ success: true }, 200, request, env);
      }

      // Comments Routes: /api/notes/:id/comments
      const commentsListMatch = path.match(/^\/api\/notes\/([^/]+)\/comments$/);
      if (commentsListMatch) {
        const noteId = commentsListMatch[1];

        if (method === "GET") {
          const comments = await listComments(noteId, env);
          return jsonResponse(comments, 200, request, env);
        }

        if (method === "POST") {
          const token = extractBearerToken(request);
          const user = await verifyUserToken(token, env);
          if (!user) {
            return jsonResponse({ error: "Sign in before posting comments." }, 401, request, env);
          }

          const body = await parseBody(request);
          const comment = await addComment(noteId, body.text, user, env);
          return jsonResponse(comment, 201, request, env);
        }
      }

      const deleteCommentMatch = path.match(/^\/api\/notes\/([^/]+)\/comments\/([^/]+)$/);
      if (deleteCommentMatch && method === "DELETE") {
        const [, noteId, commentId] = deleteCommentMatch;
        const token = extractBearerToken(request);
        const user = await verifyUserToken(token, env);
        if (!user) {
          return jsonResponse({ error: "Unauthorized." }, 401, request, env);
        }

        await deleteComment(noteId, commentId, user.uid, env);
        return jsonResponse({ success: true }, 200, request, env);
      }

      // 404 Route Not Found
      return jsonResponse({ error: `Not Found: ${method} ${path}` }, 404, request, env);
    } catch (error) {
      console.error("API Error:", error);
      return jsonResponse(
        {
          error: error.message || "An unexpected error occurred."
        },
        500,
        request,
        env
      );
    }
  }
};

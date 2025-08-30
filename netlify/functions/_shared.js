// netlify/functions/_shared.js
// Server-side utilities: CORS, JSON responses, and Firebase ID token verification.
const jose = require("jose");
const crypto = require("crypto");

// helper to detect local dev
function isLocalOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || "");
}

const ALLOWED_ORIGINS = new Set([
  "https://vignettes-io.web.app",
  "https://vignettes-io.firebaseapp.com",
  "https://vignettes.io",
  "https://www.vignettes.io",
  "https://vignettes-io.netlify.app",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
]);

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://vignettes-io.netlify.app";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, x-requested-with",
    "Vary": "Origin",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Pragma": "no-cache",
  };
}

function json(status, body, origin) {
  return { statusCode: status, headers: corsHeaders(origin), body: JSON.stringify(body) };
}

function preflight(event) {
  const origin = event.headers?.origin || "";
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(origin), body: "" };
  }
  return null;
}

function getProjectId() {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    process.env.PROJECT_ID ||
    ""
  );
}

function extractIdTokenFromEvent(event) {
  // Authorization: Bearer <token> OR ?idToken=
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || "";
  if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, "").trim();
  const qs = event.queryStringParameters || {};
  if (qs.idToken) return String(qs.idToken);
  return "";
}

async function verifyFirebaseIdToken(idToken, projectId, { origin } = {}) {
  if (!idToken) {
    const e = new Error("missing-id-token"); e.code = "missing-id-token"; throw e;
  }
  if (!projectId) {
    const e = new Error("missing-project-id"); e.code = "missing-project-id"; throw e;
  }

  // Allow emulator tokens if explicitly enabled and coming from localhost
  const allowEmu = process.env.ALLOW_EMULATOR_TOKENS === "1";
  if (allowEmu && isLocalOrigin(origin)) {
    // Emulator tokens can't be verified against Google JWKS; decode only.
    const payload = jose.decodeJwt(idToken);
    payload.uid = payload.user_id || payload.uid || payload.sub;
    if (!payload.uid) {
      const e = new Error("invalid-id-token"); e.code = "invalid-id-token"; throw e;
    }
    return { uid: payload.uid, emulated: true };
  }

  // Prod: verify signature and audience
  const JWKS = jose.createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
  const { payload } = await jose.jwtVerify(idToken, JWKS, {
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
  });
  const uid = payload.user_id || payload.uid || payload.sub;
  if (!uid) {
    const e = new Error("invalid-id-token"); e.code = "invalid-id-token"; throw e;
  }
  return { uid };
}

module.exports = {
  isLocalOrigin,
  corsHeaders,
  json,
  preflight,
  getProjectId,
  extractIdTokenFromEvent,
  verifyFirebaseIdToken,
};

// netlify/functions/_shared.js
// Server-side utilities: CORS, JSON responses, and Firebase ID token verification.
const jose = require("jose");
const crypto = require("crypto");

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

async function verifyFirebaseIdToken(idToken, projectId) {
  if (!idToken) {
    const e = new Error("missing-id-token");
    e.code = "missing-id-token";
    throw e;
  }
  if (!projectId) {
    const e = new Error("missing-project-id");
    e.code = "missing-project-id";
    throw e;
  }

  const ISSUER = `https://securetoken.google.com/${projectId}`;
  const AUD = projectId;
  const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
  const JWKS = jose.createRemoteJWKSet(new URL(JWKS_URL));

  try {
    const { payload } = await jose.jwtVerify(idToken, JWKS, { issuer: ISSUER, audience: AUD });
    // payload contains: user_id/uid, sub, email, etc.
    payload.uid = payload.user_id || payload.uid || payload.sub;
    return payload;
  } catch (err) {
    const e = new Error("invalid-id-token");
    e.code = "invalid-id-token";
    e.cause = err;
    throw e;
  }
}

function extractIdTokenFromEvent(event) {
  const hdr = event.headers?.authorization || event.headers?.Authorization || "";
  const idFromHeader = hdr.startsWith("Bearer ") ? hdr.slice(7).trim() : "";
  const idFromQuery = event.queryStringParameters?.idToken || "";
  return idFromHeader || idFromQuery || "";
}

module.exports = {
  ALLOWED_ORIGINS,
  corsHeaders,
  json,
  preflight,
  verifyFirebaseIdToken,
  getProjectId,
  extractIdTokenFromEvent,
};

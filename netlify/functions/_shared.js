// _shared.js
const jose = require("jose");

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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(statusCode, body, origin) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    body: JSON.stringify(body),
  };
}

async function verifyFirebaseIdToken(idToken, expectedProjectId) {
  if (!idToken) throw new Error("missing-id-token");

  const { kid } = jose.decodeProtectedHeader(idToken) || {};
  if (!kid) throw new Error("no-kid");

  // Firebase/Google JWKS
  const JWKS = jose.createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
  const { payload } = await jose.jwtVerify(idToken, JWKS, {
    issuer: `https://securetoken.google.com/${expectedProjectId}`,
    audience: expectedProjectId,
  });

  // Basic checks
  if (!payload || !payload.user_id) throw new Error("invalid-payload");
  return { uid: payload.user_id, email: payload.email || "" };
}

module.exports = { corsHeaders, json, verifyFirebaseIdToken };
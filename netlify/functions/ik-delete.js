// netlify/functions/ik-delete.js (cleaned)
// Deletes an ImageKit file only if it belongs to the authenticated user (users/<uid>/...)
const ImageKit = require("imagekit");
const {
  json,
  preflight,
  verifyFirebaseIdToken,
  extractIdTokenFromEvent,
  getProjectId,
} = require("./_shared");

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
});

exports.handler = async (event) => {
  const origin = event.headers?.origin || "";
  const pf = preflight(event);
  if (pf) return pf;

  if (event.httpMethod !== "POST") {
    return json(405, { error: "method-not-allowed" }, origin);
  }

  try {
    const projectId = getProjectId();
    const idToken = extractIdTokenFromEvent(event);
    const { uid } = await verifyFirebaseIdToken(idToken, projectId, { origin });

    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch (_) {}
    const fileId = body.fileId || "";
    if (!fileId) return json(400, { error: "missing-file-id" }, origin);

    // Fetch details and assert ownership
    const info = await imagekit.getFileDetails(fileId);
    let filePath = info?.filePath || info?.path || "";
    if (!filePath) return json(404, { error: "file-not-found" }, origin);

    // Normalize and verify prefix
    filePath = String(filePath).replace(/^\/+/, ""); // strip leading slashes
    const prefix = `users/${uid}/`; // strict match with trailing slash
    if (!filePath.startsWith(prefix)) {
      return json(403, { error: "forbidden", reason: "not-owner", filePath, expectedPrefix: prefix }, origin);
    }

    await imagekit.deleteFile(fileId);
    return json(200, { ok: true }, origin);
  } catch (err) {
    const msg = err?.code || err?.message || "server-error";
    const status = msg === "missing-id-token" || msg === "invalid-id-token" ? 401 : 500;
    return json(status, { error: msg }, origin);
  }
};

// netlify/functions/ik-delete.js
const ImageKit = require("imagekit");
const { json, corsHeaders, preflight, verifyFirebaseIdToken, extractIdTokenFromEvent, getProjectId } = require("./_shared");

const imagekit = new ImageKit({
  publicKey:   process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey:  process.env.IMAGEKIT_PRIVATE_KEY,
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
    const { uid } = await verifyFirebaseIdToken(idToken, projectId);

    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch (_) {}
    const fileId = body.fileId || "";
    if (!fileId) return json(400, { error: "missing-file-id" }, origin);

    // Verify ownership by inspecting the file's path
    const info = await imagekit.getFileDetails(fileId);
    const filePath = info?.filePath || info?.path || "";
    const prefix = `users/${uid}`;
    if (!filePath || !filePath.startsWith(prefix)) {
      return json(403, { error: "forbidden" }, origin);
    }

    await imagekit.deleteFile(fileId);
    return json(200, { ok: true }, origin);
  } catch (err) {
    const msg = err?.code || err?.message || "server-error";
    const status = msg === "missing-id-token" || msg === "invalid-id-token" ? 401 : 500;
    return json(status, { error: msg }, origin);
  }
};

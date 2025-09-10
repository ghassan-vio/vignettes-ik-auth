// netlify/functions/media-delete.js - Simple version (no Firebase Admin)  
const ImageKit = require("imagekit");
const { json, preflight, verifyFirebaseIdToken, extractIdTokenFromEvent, getProjectId } = require("./_shared");

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

    const body = JSON.parse(event.body || "{}");
    const { ikFileId, ikThumbFileId } = body;

    // Delete from ImageKit (frontend handles Firestore deletion)
    if (ikFileId) {
      await imagekit.deleteFile(ikFileId);
    }
    if (ikThumbFileId) {
      await imagekit.deleteFile(ikThumbFileId);
    }

    return json(200, { success: true }, origin);
  } catch (err) {
    console.error("media-delete error:", err);
    const msg = err?.code || err?.message || "server-error";
    const status = msg === "missing-id-token" || msg === "invalid-id-token" ? 401 : 500;
    return json(status, { error: msg }, origin);
  }
};
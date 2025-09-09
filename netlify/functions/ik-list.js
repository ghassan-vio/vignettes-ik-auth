// netlify/functions/ik-list.js
const ImageKit = require("imagekit");
const {
  json, preflight,
  verifyFirebaseIdToken, extractIdTokenFromEvent, getProjectId
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

  try {
    const projectId = getProjectId();
    const idToken = extractIdTokenFromEvent(event);
    const { uid } = await verifyFirebaseIdToken(idToken, projectId, { origin });

    const q = event.queryStringParameters || {};
    const qType = String(q.type || "image").toLowerCase();
    const type = qType === "video-thumb" ? "video-thumb" : "image";

    // List everything under the user's *type* subtree (recursively)
    const limit = Math.max(1, Math.min(Number(q.limit || 60), 200));
    const base = type === "image"
      ? `users/${uid}/images/`
      : `users/${uid}/video-thumbs/`;

    // Use path parameter instead of searchQuery with LIKE
    const files = await imagekit.listFiles({
      path: base.replace(/\/$/, ""), // Remove trailing slash for path parameter
      sort: "DESC_CREATED",
      limit,
    });

    const items = (files || []).map(f => ({
      fileId: f.fileId,
      name: f.name,
      filePath: f.filePath || f.path || "",
      url: f.url,
      thumbnail: f.thumbnailUrl,
      size: f.size,
      mime: f.mime || f.mimeType || "",
      createdAt: f.createdAt,
    }));

    return json(200, { items, type }, origin);
  } catch (err) {
    const msg = err?.code || err?.message || "server-error";
    const status = msg === "missing-id-token" || msg === "invalid-id-token" ? 401 : 500;
    return json(status, { error: msg }, origin);
  }
};
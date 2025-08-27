// netlify/functions/ik-list.js
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

  try {
    const projectId = getProjectId();
    const idToken = extractIdTokenFromEvent(event);
    const { uid } = await verifyFirebaseIdToken(idToken, projectId);

    const prefix = `users/${uid}`;
    const limit = Math.max(1, Math.min(Number(event.queryStringParameters?.limit || 30), 100));

    const files = await imagekit.listFiles({ path: prefix, limit });

    const items = (files || []).map(f => ({
      fileId:    f.fileId,
      name:      f.name,
      filePath:  f.filePath || f.path || "",
      url:       f.url,
      thumbnail: f.thumbnailUrl,
      size:      f.size,
      mime:      f.mime || f.MIME_TYPE || "",
      createdAt: f.createdAt,
    }));

    return json(200, { items }, origin);
  } catch (err) {
    const msg = err?.code || err?.message || "server-error";
    const status = msg === "missing-id-token" || msg === "invalid-id-token" ? 401 : 500;
    return json(status, { error: msg }, origin);
  }
};

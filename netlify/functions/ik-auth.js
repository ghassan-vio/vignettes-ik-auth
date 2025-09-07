// netlify/functions/ik-auth.js
const crypto = require("crypto");
const ImageKit = require("imagekit");
const { json, preflight, verifyFirebaseIdToken, extractIdTokenFromEvent, getProjectId } = require("./_shared");

const imagekit = new ImageKit({
  publicKey:   process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey:  process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
});

// Per-type env fallbacks (admins can set real limits via Firestore later)
const MAX_IMAGES = Number(process.env.MAX_IMAGES || 50);
const MAX_THUMBS = Number(process.env.MAX_VIDEO_THUMBS || 200);

exports.handler = async (event) => {
  const origin = event.headers?.origin || "";
  const pf = preflight(event);
  if (pf) return pf;

  try {
    const projectId = getProjectId();
    const idToken = extractIdTokenFromEvent(event);
    const { uid } = await verifyFirebaseIdToken(idToken, projectId, { origin });

    // Choose target type (image uploads or video thumbnails)
    const qType = (event.queryStringParameters?.type || "image").toLowerCase();
    const type = qType === "video-thumb" ? "video-thumb" : "image";

    // Date-bucket folders: users/<uid>/images/YYYY/MM or users/<uid>/video-thumbs/YYYY/MM
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");

    const folders = {
      image:       `users/${uid}/images/${y}/${m}/`,
      "video-thumb": `users/${uid}/video-thumbs/${y}/${m}/`,
    };
    const folder = folders[type];

    // Optional: compute 'used' for the chosen type (cheap list limited to the subtree)
    let used = 0;
    try {
      const files = await imagekit.listFiles({ path: folder.replace(/\/$/, ""), limit: 1000 });
      used = Array.isArray(files) ? files.length : 0;
    } catch (_) { used = 0; }

    const limit = type === "image" ? MAX_IMAGES : MAX_THUMBS;

    // Short-lived upload auth for the browser SDK
    const token = crypto.randomBytes(16).toString("hex");
    const expire = Math.floor(Date.now() / 1000) + 60 * 5; // 5 minutes
    const signature = crypto
      .createHmac("sha1", process.env.IMAGEKIT_PRIVATE_KEY)
      .update(token + expire)
      .digest("hex");

    return json(200, {
      token, expire, signature,
      publicKey:   process.env.IMAGEKIT_PUBLIC_KEY,
      urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,

      // Where to upload *this* item, plus a handy map for the client
      folder,
      folders,

      // Per-type quota snapshot (UI-only; true enforcement lives in Firestore quotas)
      used, limit, type,
    }, origin);
  } catch (err) {
    const msg = err?.code || err?.message || "server-error";
    const status = msg === "missing-id-token" || msg === "invalid-id-token" ? 401 : 500;
    return json(status, { error: msg }, origin);
  }
};
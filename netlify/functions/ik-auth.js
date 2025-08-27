// netlify/functions/ik-auth.js
const crypto = require("crypto");
const ImageKit = require("imagekit");
const { json, corsHeaders, preflight, verifyFirebaseIdToken, extractIdTokenFromEvent, getProjectId } = require("./_shared");

const imagekit = new ImageKit({
  publicKey:   process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey:  process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
});

const MAX_FILES = Number(process.env.MAX_FILES || 5);

exports.handler = async (event) => {
  const origin = event.headers?.origin || "";
  const pf = preflight(event);
  if (pf) return pf;

  try {
    const projectId = getProjectId();
    const idToken = extractIdTokenFromEvent(event);
    //const { uid } = await verifyFirebaseIdToken(idToken, projectId);
    const { uid } = await verifyFirebaseIdToken(idToken, projectId, { origin });
    // Count current files in the user's folder
    const folder = `users/${uid}`;
    let used = 0;
    try {
      const files = await imagekit.listFiles({ path: folder, limit: 100 });
      used = Array.isArray(files) ? files.length : 0;
    } catch (_) {
      // If the folder doesn't exist yet, treat as zero
      used = 0;
    }

    // Create short-lived upload auth for ImageKit JS SDK
    const token = crypto.randomBytes(16).toString("hex");
    const expire = Math.floor(Date.now() / 1000) + 60 * 5; // 5 minutes
    const signature = crypto.createHmac("sha1", process.env.IMAGEKIT_PRIVATE_KEY).update(token + expire).digest("hex");

    return json(200, {
      // Upload credentials
      token, expire, signature,
      // Client config
      publicKey:   process.env.IMAGEKIT_PUBLIC_KEY,
      urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
      // Quota information for UI
      used, limit: MAX_FILES,
      // Where uploads should go
      folder,
    }, origin);
  } catch (err) {
    const msg = err?.code || err?.message || "server-error";
    const status = msg === "missing-id-token" || msg === "invalid-id-token" ? 401 : 500;
    return json(status, { error: msg }, origin);
  }
};

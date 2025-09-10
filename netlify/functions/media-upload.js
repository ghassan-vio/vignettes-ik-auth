// netlify/functions/media-upload.js - Simple version (no Firebase Admin)
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
    const { type, imageData, customThumbData } = body;

    if (type === "image" && imageData) {
      // Upload image to ImageKit
      const result = await imagekit.upload({
        file: imageData,
        fileName: `img_${Date.now()}.jpg`,
        folder: `users/${uid}/images/`,
        useUniqueFileName: true,
      });

      return json(200, { 
        success: true,
        imageUrl: result.url,
        ikFileId: result.fileId,
        // Frontend will save metadata to Firestore
      }, origin);
    } 
    else if (type === "video-thumb" && customThumbData) {
      // Upload custom thumbnail to ImageKit
      const result = await imagekit.upload({
        file: customThumbData,
        fileName: `thumb_${Date.now()}.jpg`,
        folder: `users/${uid}/thumbs/`,
        useUniqueFileName: true,
      });

      return json(200, { 
        success: true,
        thumbUrl: result.url,
        ikThumbFileId: result.fileId,
      }, origin);
    }
    else {
      return json(400, { error: "invalid-request" }, origin);
    }
  } catch (err) {
    console.error("media-upload error:", err);
    const msg = err?.code || err?.message || "server-error";
    const status = msg === "missing-id-token" || msg === "invalid-id-token" ? 401 : 500;
    return json(status, { error: msg }, origin);
  }
};
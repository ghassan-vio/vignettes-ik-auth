// =====================================================
// netlify/functions/media-delete.js
const ImageKit = require("imagekit");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { json, preflight, verifyFirebaseIdToken, extractIdTokenFromEvent, getProjectId } = require("./_shared");

// Initialize Firebase Admin (only once)
if (!process.env.FIREBASE_ADMIN_INITIALIZED) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
  process.env.FIREBASE_ADMIN_INITIALIZED = 'true';
}

const db = getFirestore();
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
    const { type, itemId } = body;

    if (!itemId) {
      return json(400, { error: "missing-item-id" }, origin);
    }

    const collection = type === "image" ? "media_images" : "media_videos";
    const docRef = db.collection(`users/${uid}/${collection}`).doc(itemId);
    
    // Get document data
    const doc = await docRef.get();
    if (!doc.exists) {
      return json(404, { error: "item-not-found" }, origin);
    }

    const data = doc.data();

    // Delete from ImageKit
    try {
      if (type === "image" && data.ikFileId) {
        await imagekit.deleteFile(data.ikFileId);
      } else if (type === "video" && data.ikThumbFileId) {
        await imagekit.deleteFile(data.ikThumbFileId);
      }
    } catch (ikError) {
      console.warn("ImageKit deletion failed:", ikError);
      // Continue with Firestore deletion even if ImageKit fails
    }

    // Delete from Firestore
    await docRef.delete();

    return json(200, { success: true, itemId }, origin);
  } catch (err) {
    console.error("media-delete error:", err);
    const msg = err?.code || err?.message || "server-error";
    const status = msg === "missing-id-token" || msg === "invalid-id-token" ? 401 : 500;
    return json(status, { error: msg }, origin);
  }
};
// netlify/functions/media-update.js
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
    const { type, itemId, title, caption } = body;

    if (!itemId) {
      return json(400, { error: "missing-item-id" }, origin);
    }

    const collection = type === "image" ? "media_images" : "media_videos";
    const docRef = db.collection(`users/${uid}/${collection}`).doc(itemId);
    
    // Check if document exists and belongs to user
    const doc = await docRef.get();
    if (!doc.exists) {
      return json(404, { error: "item-not-found" }, origin);
    }

    // Update only title and caption (moderation is admin-only)
    await docRef.update({
      title: title || "Untitled",
      caption: caption || "",
      updatedAt: new Date(),
    });

    return json(200, { success: true, itemId }, origin);
  } catch (err) {
    console.error("media-update error:", err);
    const msg = err?.code || err?.message || "server-error";
    const status = msg === "missing-id-token" || msg === "invalid-id-token" ? 401 : 500;
    return json(status, { error: msg }, origin);
  }
};
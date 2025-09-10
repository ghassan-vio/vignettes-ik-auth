// netlify/functions/media-list.js
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

  try {
    const projectId = getProjectId();
    const idToken = extractIdTokenFromEvent(event);
    const { uid } = await verifyFirebaseIdToken(idToken, projectId, { origin });

    const q = event.queryStringParameters || {};
    const type = (q.type || "images").toLowerCase();

    if (type === "images") {
      const images = await listImages(uid);
      return json(200, { 
        items: images, 
        type: "images",
        count: images.length 
      }, origin);
    } else if (type === "videos") {
      const videos = await listVideos(uid);
      return json(200, { 
        items: videos, 
        type: "videos",
        count: videos.length 
      }, origin);
    } else {
      return json(400, { error: "invalid-type" }, origin);
    }
  } catch (err) {
    console.error("media-list error:", err);
    const msg = err?.code || err?.message || "server-error";
    const status = msg === "missing-id-token" || msg === "invalid-id-token" ? 401 : 500;
    return json(status, { error: msg }, origin);
  }
};

async function listImages(uid) {
  const snapshot = await db
    .collection(`users/${uid}/media_images`)
    .where('moderation', '==', 'ok') // Only show non-reported images
    .orderBy('uploadedAt', 'desc')
    .limit(50)
    .get();

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    uploadedAt: doc.data().uploadedAt?.toDate?.() || doc.data().uploadedAt,
  }));
}

async function listVideos(uid) {
  const snapshot = await db
    .collection(`users/${uid}/media_videos`)
    .where('moderation', '==', 'ok') // Only show non-reported videos
    .orderBy('uploadedAt', 'desc')
    .limit(50)
    .get();

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    uploadedAt: doc.data().uploadedAt?.toDate?.() || doc.data().uploadedAt,
  }));
}
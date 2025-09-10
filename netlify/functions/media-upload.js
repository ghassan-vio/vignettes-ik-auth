// netlify/functions/media-upload.js
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
    const { type, title = "", caption = "", imageData, videoUrl, customThumbData } = body;

    if (type === "image") {
      return await uploadImage(uid, { title, caption, imageData }, origin);
    } else if (type === "video") {
      return await addVideo(uid, { title, caption, videoUrl, customThumbData }, origin);
    } else {
      return json(400, { error: "invalid-type" }, origin);
    }
  } catch (err) {
    console.error("media-upload error:", err);
    const msg = err?.code || err?.message || "server-error";
    const status = msg === "missing-id-token" || msg === "invalid-id-token" ? 401 : 500;
    return json(status, { error: msg }, origin);
  }
};

async function uploadImage(uid, { title, caption, imageData }, origin) {
  // Upload to ImageKit
  const result = await imagekit.upload({
    file: imageData, // base64 or buffer
    fileName: `img_${Date.now()}.jpg`,
    folder: `users/${uid}/images/`,
    useUniqueFileName: true,
  });

  // Save to Firestore
  const imageDoc = {
    uploadedAt: new Date(),
    title: title || "Untitled Image",
    caption: caption || "",
    imageUrl: result.url,
    ikFileId: result.fileId,
    moderation: "ok",
  };

  const docRef = db.collection(`users/${uid}/media_images`).doc();
  await docRef.set(imageDoc);

  return json(200, { 
    success: true, 
    imageId: docRef.id,
    ...imageDoc 
  }, origin);
}

async function addVideo(uid, { title, caption, videoUrl, customThumbData }, origin) {
  let thumbUrl = "https://ik.imagekit.io/vignettesio/default/video_default_thumbnail.png";
  let ikThumbFileId = null;
  let provider = "youtube"; // default

  // Parse video URL
  const parsed = parseVideoUrl(videoUrl);
  if (parsed) {
    thumbUrl = parsed.thumbUrl || thumbUrl;
    provider = parsed.provider;
  }

  // Upload custom thumbnail if provided
  if (customThumbData) {
    const thumbResult = await imagekit.upload({
      file: customThumbData,
      fileName: `thumb_${Date.now()}.jpg`,
      folder: `users/${uid}/thumbs/`,
      useUniqueFileName: true,
    });
    thumbUrl = thumbResult.url;
    ikThumbFileId = thumbResult.fileId;
  }

  // Save to Firestore
  const videoDoc = {
    uploadedAt: new Date(),
    title: title || "Untitled Video",
    caption: caption || "",
    videoUrl,
    thumbUrl,
    ikThumbFileId,
    provider,
    moderation: "ok",
  };

  const docRef = db.collection(`users/${uid}/media_videos`).doc();
  await docRef.set(videoDoc);

  return json(200, { 
    success: true, 
    videoId: docRef.id,
    ...videoDoc 
  }, origin);
}

function parseVideoUrl(url) {
  if (!url) return null;

  // YouTube
  const ytMatch = url.match(/(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{6,})/i);
  if (ytMatch) {
    const id = ytMatch[1];
    return {
      provider: 'youtube',
      id,
      thumbUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    };
  }

  // Vimeo
  const vimeoMatch = url.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/i);
  if (vimeoMatch) {
    return {
      provider: 'vimeo',
      id: vimeoMatch[1],
      thumbUrl: null, // Will use default
    };
  }

  return null;
}
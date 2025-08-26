// ik-list.js
const ImageKit = require("imagekit");
const { json, corsHeaders, verifyFirebaseIdToken } = require("./_shared");

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
});

exports.handler = async (event) => {
  const origin = event.headers.origin || "";
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(origin), body: "" };
  }

  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const idToken = (event.queryStringParameters && event.queryStringParameters.idToken) || "";
    const { uid } = await verifyFirebaseIdToken(idToken, projectId);

    const prefix = `users/${uid}`;
    const limit = Math.min(Number(event.queryStringParameters?.limit || 30), 100);
    const files = await imagekit.listFiles({ path: prefix, limit });

    // Return minimal fields the client needs
    const items = (files || []).map(f => ({
      fileId: f.fileId,
      name: f.name,
      path: f.filePath || f.filePath || f.path, // SDKs vary
      url: f.url,
      thumbnail: f.thumbnailUrl,
      size: f.size,
      mime: f.mime || f.mimeType,
      createdAt: f.createdAt,
    }));

    return json(200, { items }, origin);
  } catch (err) {
    const code = err && err.message || "list-error";
    const status = code.startsWith("missing-id-token") ? 401 : 500;
    return json(status, { error: code }, origin);
  }
};

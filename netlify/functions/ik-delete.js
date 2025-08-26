// ik-delete.js
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

  if (event.httpMethod !== "POST") {
    return json(405, { error: "method-not-allowed" }, origin);
  }

  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const { uid } = await verifyFirebaseIdToken((event.queryStringParameters || {}).idToken, projectId);

    const body = JSON.parse(event.body || "{}");
    const fileId = body.fileId || "";

    if (!fileId) return json(400, { error: "missing-fileId" }, origin);

    // Defensive ownership check: fetch details, ensure path belongs to users/<uid>
    const details = await imagekit.getFileDetails(fileId);
    const path = (details && (details.filePath || details.filePath || details.path)) || "";
    const expectedPrefix = `/users/${uid}`;
    if (!path.startsWith(expectedPrefix + "/") && path !== expectedPrefix) {
      return json(403, { error: "forbidden", message: "Not your file." }, origin);
    }

    await imagekit.deleteFile(fileId);
    return json(200, { ok: true }, origin);
  } catch (err) {
    const code = err && err.message || "delete-error";
    const status = code.startsWith("missing-id-token") ? 401 : 500;
    return json(status, { error: code }, origin);
  }
};

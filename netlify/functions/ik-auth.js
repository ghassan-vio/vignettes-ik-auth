// ik-auth.js
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

    // Simple quota check: count files in users/<uid>
    const prefix = `users/${uid}`;
    const files = await imagekit.listFiles({ path: prefix, limit: 100 });
    const count = Array.isArray(files) ? files.length : 0;
    if (count >= 5) {
      return json(403, { error: "quota-exceeded", message: "Trial limit reached (5 images)." }, origin);
    }

    // 60s token for client SDK (upload)
    const auth = imagekit.getAuthenticationParameters();
    // Return folder to enforce client writing only under users/<uid>
    return json(200, { ...auth, folder: prefix, quota: { used: count, max: 5 } }, origin);
  } catch (err) {
    // Friendly error for popup cancel, etc., is handled client-side; here we just return 401/500
    const code = err && err.message || "auth-error";
    const status = code.includes("missing-id-token") ? 401 : 500;
    return json(status, { error: code }, origin);
  }
};

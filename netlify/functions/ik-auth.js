const ImageKit = require("imagekit");
const { json, corsHeaders, verifyFirebaseIdToken } = require("./_shared");

const imagekit = new ImageKit({
  publicKey:   process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey:  process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
});

const MAX_FILES = 5;

exports.handler = async (event) => {
  const origin = event.headers.origin || "";

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(origin), body: "" };
  }

  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const idToken = (event.queryStringParameters && event.queryStringParameters.idToken) || "";
    const verified = await verifyFirebaseIdToken(idToken, projectId);
    const uid = verified.uid;

    const folder = "users/" + uid;
    const files = await imagekit.listFiles({ path: folder, limit: MAX_FILES + 1 });
    const used = Array.isArray(files) ? files.length : 0;

    if (used >= MAX_FILES) {
      return json(
        403,
        { error: "quota-exceeded", message: "Trial limit reached (" + MAX_FILES + " images).", quota: { used: used, max: MAX_FILES } },
        origin
      );
    }

    const auth = imagekit.getAuthenticationParameters();

    return json(
      200,
      {
        token: auth.token,
        expire: auth.expire,
        signature: auth.signature,
        folder: folder,
        quota: { used: used, max: MAX_FILES },
        publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
        urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
      },
      origin
    );
  } catch (err) {
    const msg = String(err && err.message || "auth-error");
    const status =
      msg.indexOf("missing-id-token") !== -1 || msg.indexOf("no-kid") !== -1 || msg.indexOf("invalid-payload") !== -1
        ? 401
        : 500;

    return json(status, { error: msg }, origin);
  }
};
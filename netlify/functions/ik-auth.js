// netlify/functions/ik-auth.js
const ImageKit = require('imagekit');
const { createRemoteJWKSet, jwtVerify } = require('jose');
const crypto = require('crypto');

const {
  FIREBASE_PROJECT_ID,
  IMAGEKIT_PRIVATE_KEY,
  IMAGEKIT_PUBLIC_KEY,
  IMAGEKIT_URL_ENDPOINT,
} = process.env;

// Verify Firebase ID token with Google JWKS (no Admin SDK needed)
const ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com')
);

async function verifyToken(idToken) {
  if (!idToken) throw new Error('no-token');
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: ISSUER,
    audience: FIREBASE_PROJECT_ID,
  });
  return payload; // contains sub (uid)
}

const ik = new ImageKit({
  publicKey: IMAGEKIT_PUBLIC_KEY,
  privateKey: IMAGEKIT_PRIVATE_KEY, // stays on server
  urlEndpoint: IMAGEKIT_URL_ENDPOINT
});

// Count files in /users/<uid> up to limit (5)
async function countUserFiles(uid, limit = 5) {
  const path = `/users/${uid}`;
  let page = 1, perPage = 100, count = 0;
  while (true) {
    const files = await ik.listFiles({ path, sort: 'ASC_NAME', limit: perPage, skip: (page - 1) * perPage });
    count += files.length;
    if (count >= limit || files.length < perPage) break;
    page++;
  }
  return count;
}

exports.handler = async (event) => {
  try {
    const idToken =
      (event.queryStringParameters && event.queryStringParameters.idToken) ||
      (event.headers.authorization || '').replace(/^Bearer\s+/i, '');

    const payload = await verifyToken(idToken);
    const uid = payload.sub;

    const current = await countUserFiles(uid, 5);
    if (current >= 5) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'upload-limit', message: 'Upload limit reached. [E-UPL-LIMIT-001]' })
      };
    }

    const expire = Math.floor(Date.now() / 1000) + 60; // 60s
    const token  = crypto.randomBytes(16).toString('hex');
    const auth   = ik.getAuthenticationParameters({ token, expire });

    return { statusCode: 200, body: JSON.stringify(auth) };
  } catch (_e) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'auth-failed', message: 'Unable to authorize upload. [E-AUTH-001]' })
    };
  }
};

// netlify/functions/ik-delete.js
const ImageKit = require('imagekit');
const { createRemoteJWKSet, jwtVerify } = require('jose');

const { FIREBASE_PROJECT_ID, IMAGEKIT_PRIVATE_KEY, IMAGEKIT_PUBLIC_KEY, IMAGEKIT_URL_ENDPOINT } = process.env;
const ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'));

async function verifyToken(idToken) {
  if (!idToken) throw new Error('no-token');
  const { payload } = await jwtVerify(idToken, JWKS, { issuer: ISSUER, audience: FIREBASE_PROJECT_ID });
  return payload;
}

const ik = new ImageKit({ publicKey: IMAGEKIT_PUBLIC_KEY, privateKey: IMAGEKIT_PRIVATE_KEY, urlEndpoint: IMAGEKIT_URL_ENDPOINT });

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const idToken = (event.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const payload = await verifyToken(idToken);
    const uid = payload.sub;

    const { fileId, filePath } = JSON.parse(event.body || '{}');
    if (!fileId) return { statusCode: 400, body: JSON.stringify({ error:'bad-request', message:'Missing fileId [E-LIB-DEL-VAL-001]' }) };

    // Basic ownership check: path must be inside /users/<uid>
    if (!filePath || !new RegExp(`^/?users/${uid}(/|$)`).test(filePath)) {
      return { statusCode: 403, body: JSON.stringify({ error:'forbidden', message:'Not allowed to delete this file. [E-LIB-DEL-OWN-001]' }) };
    }

    await ik.deleteFile(fileId);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (_e) {
    return { statusCode: 401, body: JSON.stringify({ error:'auth-failed', message:'Unable to delete file. [E-LIB-DEL-001]' }) };
  }
};
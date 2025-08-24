// netlify/functions/ik-list.js
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
    const idToken = (event.queryStringParameters && event.queryStringParameters.idToken) ||
                    (event.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const payload = await verifyToken(idToken);
    const uid = payload.sub;

    const path = `/users/${uid}`;
    let page = 1, perPage = 100, count = 0, items = [], done = false;
    while (!done) {
      const files = await ik.listFiles({ path, sort: 'ASC_NAME', limit: perPage, skip: (page - 1) * perPage });
      count += files.length;
      items.push(...files.map(f => ({
        fileId: f.fileId,
        url: f.url,
        thumbnailUrl: f.thumbnailUrl || f.url,
        filePath: f.filePath || f.file_path || f.name
      })));
      if (files.length < perPage) done = true; else page++;
    }

    return { statusCode: 200, body: JSON.stringify({ items, count }) };
  } catch (_e) {
    return { statusCode: 401, body: JSON.stringify({ error: 'auth-failed', message: 'Unable to list files. [E-LIB-LIST-001]' }) };
  }
};
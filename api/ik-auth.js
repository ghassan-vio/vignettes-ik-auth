// api/ik-auth.js
// Vercel serverless function (ESM)
import { randomBytes } from 'node:crypto'; 
import ImageKit from 'imagekit';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const {
  FIREBASE_PROJECT_ID,
  IMAGEKIT_PRIVATE_KEY,
  IMAGEKIT_PUBLIC_KEY,
  IMAGEKIT_URL_ENDPOINT,
} = process.env;

// Verify Firebase ID token with Google JWKS (no service account needed)
const ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com')
);

async function verifyFirebaseIdToken(idToken) {
  if (!idToken) throw new Error('no-token');
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: ISSUER,
    audience: FIREBASE_PROJECT_ID,
  });
  return payload; // contains sub (uid), email, etc.
}

const ik = new ImageKit({
  publicKey: IMAGEKIT_PUBLIC_KEY,
  privateKey: IMAGEKIT_PRIVATE_KEY,      // stays ONLY on server
  urlEndpoint: IMAGEKIT_URL_ENDPOINT
});

// Helper: count files in users/<uid> (stop early when we reach 5)
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

export default async function handler(req, res) {
  try {
    const idToken =
      req.query.idToken ||
      (req.headers.authorization || '').replace(/^Bearer\s+/i, '');

    const payload = await verifyFirebaseIdToken(idToken);
    const uid = payload.sub;

    const current = await countUserFiles(uid, 5);
    if (current >= 5) {
      return res
        .status(403)
        .json({ error: 'upload-limit', message: 'Upload limit reached. [E-UPL-LIMIT-001]' });
    }

    const expire = Math.floor(Date.now() / 1000) + 60; // 60s
    const token  = randomBytes(16).toString('hex');
    const authParams = ik.getAuthenticationParameters({ token, expire });

    return res.status(200).json(authParams);
  } catch (_e) {
    // keep messages generic (no platform names)
    return res
      .status(401)
      .json({ error: 'auth-failed', message: 'Unable to authorize upload. [E-AUTH-001]' });
  }
}

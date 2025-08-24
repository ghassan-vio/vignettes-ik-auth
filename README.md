# vignettes-ik-auth (Vercel)

Serverless endpoint for ImageKit auth + Trial limit (5 files per user).

## Endpoint

`GET /api/ik-auth?idToken=...`

- Verifies Firebase ID token (no Admin SDK).
- Counts files in `users/<uid>` on ImageKit.
- If count < 5, returns `{ token, expire, signature }` for ImageKit JS SDK.

## Environment Variables (set in Vercel project settings)

- `FIREBASE_PROJECT_ID` = e.g. `vignettes-io`
- `IMAGEKIT_PRIVATE_KEY` = from ImageKit dashboard (keep secret)
- `IMAGEKIT_PUBLIC_KEY`  = your public key
- `IMAGEKIT_URL_ENDPOINT` = e.g. `https://ik.imagekit.io/vignettesio`

## Deploy

1. Push this repo to GitHub.
2. Import into Vercel → Framework: **Other**.
3. Set the env vars above.
4. Deploy.

## Client usage

```js
const imagekit = new ImageKit({
  publicKey: "YOUR_PUBLIC_KEY",
  urlEndpoint: "https://ik.imagekit.io/your_account",
  authenticationEndpoint: "https://your-project.vercel.app/api/ik-auth"
});

// Before upload:
const token = await auth.currentUser.getIdToken(true);
imagekit.authenticationEndpoint =
  `https://your-project.vercel.app/api/ik-auth?idToken=${encodeURIComponent(token)}`;

const res = await imagekit.upload({
  file,
  fileName: file.name,
  folder: `users/${auth.currentUser.uid}`,
  useUniqueFileName: true
});

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const sa = JSON.parse(fs.readFileSync(path.join(process.cwd(), "android", "play-console-service-account.json"), "utf8"));
const packageName = process.env.PACKAGE_NAME || "cafe.liberte.app";
const notesPath = path.join(process.cwd(), "android/app/src/main/play/release-notes/tr-TR/internal.txt");
const releaseNotes = fs.existsSync(notesPath)
  ? fs.readFileSync(notesPath, "utf8").trim()
  : "Liberte Club guncellemesi";

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${header}.${claim}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  const jwt = `${unsigned}.${signer.sign(sa.private_key, "base64url")}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Play token alinamadi");
  return data.access_token;
}

async function api(token, method, url, body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 400) }; }
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Play API ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const token = await getAccessToken();
const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}`;
const edit = await api(token, "POST", `${base}/edits`, {});
const editId = edit.id;

const alpha = await api(token, "GET", `${base}/edits/${editId}/tracks/alpha`);
const alphaRelease = (alpha.releases || []).find((r) => (r.versionCodes || []).length) || null;
if (!alphaRelease) {
  console.error("Alpha kanalinda surum yok");
  process.exit(1);
}

const versionCodes = alphaRelease.versionCodes;
const name = alphaRelease.name || String(versionCodes[0]);

await api(token, "PUT", `${base}/edits/${editId}/tracks/internal`, {
  track: "internal",
  releases: [{
    name,
    status: "completed",
    versionCodes,
    releaseNotes: [{ language: "tr-TR", text: releaseNotes.slice(0, 500) }]
  }]
});

const commit = await api(token, "POST", `${base}/edits/${editId}:commit`);
console.log(JSON.stringify({
  ok: true,
  packageName,
  promotedTo: "internal",
  fromTrack: "alpha",
  name,
  versionCodes,
  commitId: commit.id || editId
}, null, 2));
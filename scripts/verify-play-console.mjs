import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const saPath = path.join(process.cwd(), "android", "play-console-service-account.json");
if (!fs.existsSync(saPath)) {
  console.error("[play-verify] servis hesabi yok");
  process.exit(1);
}
const sa = JSON.parse(fs.readFileSync(saPath, "utf8"));
const packageName = process.env.PACKAGE_NAME || "cafe.liberte.app";

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
  if (!data.access_token) throw new Error("token yok");
  return data.access_token;
}

async function api(token, method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data;
}

const token = await getAccessToken();
const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}`;
const edit = await api(token, "POST", `${base}/edits`, {});
const summary = { packageName, tracks: {} };
for (const track of ["internal", "alpha", "beta", "production"]) {
  try {
    const data = await api(token, "GET", `${base}/edits/${edit.id}/tracks/${track}`);
    summary.tracks[track] = (data.releases || []).map((r) => ({
      name: r.name,
      status: r.status,
      versionCodes: r.versionCodes || []
    }));
  } catch (err) {
    summary.tracks[track] = { error: err.message };
  }
}
await fetch(`${base}/edits/${edit.id}`, {
  method: "DELETE",
  headers: { Authorization: `Bearer ${token}` }
}).catch(() => {});
console.log(JSON.stringify(summary, null, 2));
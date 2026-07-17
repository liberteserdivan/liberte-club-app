import fs from "fs";
import path from "path";

const yamlPath = path.resolve(process.cwd(), "codemagic.yaml");

function toAscii(text) {
  const map = {
    "\u2014": "-",
    "\u2013": "-",
    "\u2192": "->",
    "\u2190": "<-",
    "\u2026": "...",
    "\u2018": "'",
    "\u2019": "'",
    "\u201C": '"',
    "\u201D": '"',
    "\u0131": "i",
    "\u0130": "I",
    "\u011F": "g",
    "\u011E": "G",
    "\u015F": "s",
    "\u015E": "S",
    "\u00E7": "c",
    "\u00C7": "C",
    "\u00F6": "o",
    "\u00D6": "O",
    "\u00FC": "u",
    "\u00DC": "U",
  };
  let out = text;
  for (const [from, to] of Object.entries(map)) {
    out = out.split(from).join(to);
  }
  return out.replace(/[^\x00-\x7F]/g, "");
}

function bumpAndroidReleaseMinVersion(text, code) {
  const marker = "  android-release:";
  const idx = text.indexOf(marker);
  if (idx === -1) return text;
  const rest = text.slice(idx + marker.length);
  const nextWorkflow = rest.search(/\n  [a-z0-9_-]+:\n/);
  const end = nextWorkflow === -1 ? text.length : idx + marker.length + nextWorkflow;
  const block = text.slice(idx, end);
  const updated = block.replace(/(ANDROID_MIN_VERSION_CODE:\s*")[^"]+(")/, `$1${code}$2`);
  return text.slice(0, idx) + updated + text.slice(end);
}

function countBytes(buf) {
  let high = 0;
  let x9e = 0;
  for (const b of buf) {
    if (b > 127) high++;
    if (b === 0x9e) x9e++;
  }
  return { high, x9e };
}

const raw = fs.readFileSync(yamlPath);
let text = toAscii(raw.toString("utf8"));
text = bumpAndroidReleaseMinVersion(text, "96");
const out = Buffer.from(text, "utf8");
fs.writeFileSync(yamlPath, out);
const counts = countBytes(out);
console.log(JSON.stringify({ file: yamlPath, ...counts, lines: text.split("\n").length }));
if (counts.x9e !== 0) process.exitCode = 1;

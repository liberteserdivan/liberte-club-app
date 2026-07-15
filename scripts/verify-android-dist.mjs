#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const distAssets = join(process.cwd(), "dist", "assets");
if (!existsSync(distAssets)) {
  console.error("[verify-android-dist] dist/assets yok");
  process.exit(1);
}

const bundle = readdirSync(distAssets)
  .filter((n) => n.endsWith(".js"))
  .map((n) => readFileSync(join(distAssets, n), "utf8"))
  .join("\n");

const needles = ["Ayarları Aç", "Bildirimleri Aç", "login-submit", "Giriş Yap"];
const found = needles.filter((n) => bundle.includes(n));
if (!found.length) {
  console.error(`[verify-android-dist] UI imzasi yok: ${needles.join(", ")}`);
  process.exit(1);
}
console.log(`[verify-android-dist] UI imzalari: ${found.join(", ")}`);
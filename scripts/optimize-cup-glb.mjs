import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import {
  center,
  dedup,
  flatten,
  inspect,
  prune,
  quantize,
  simplify,
  textureCompress,
  weld
} from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptSimplifier } from 'meshoptimizer';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceFile = process.argv[2] || 'Liberte_Cup_Luwai.glb';
const outFile = process.argv[3] || 'Liberte_Cup_Luwai_App.glb';
const sourcePath = join(root, 'public', sourceFile);
const outPath = join(root, 'public', outFile);

const TARGET_HEIGHT = 1.35;

// Draco sıkıştırmalı kaynak dosyayı oku
async function createIO() {
  const decoder = await draco3d.createDecoderModule();
  const encoder = await draco3d.createEncoderModule();
  return new NodeIO()
    .registerExtensions([KHRDracoMeshCompression])
    .registerDependencies({
      'draco3d.decoder': decoder,
      'draco3d.encoder': encoder
    });
}

// Kök düğümü hedef yüksekliğe ölçekle
function scaleToHeight(doc, targetHeight) {
  const scene = doc.getRoot().getDefaultScene();
  if (!scene) return;

  const info = inspect(doc).scenes?.properties?.[0];
  if (!info?.bboxMin || !info?.bboxMax) return;

  const height = info.bboxMax[1] - info.bboxMin[1];
  if (!height) return;

  const factor = targetHeight / height;
  for (const node of scene.listChildren()) {
    const [sx, sy, sz] = node.getScale();
    node.setScale([sx * factor, sy * factor, sz * factor]);
  }
}

const io = await createIO();
const doc = await io.readBinary(readFileSync(sourcePath));

console.log('Kaynak:', sourcePath, `(${Math.round(readFileSync(sourcePath).length / 1024)} KB)`);
console.log('--- Önce ---');
console.log(JSON.stringify(inspect(doc).meshes, null, 2));

await doc.transform(
  dedup(),
  weld(),
  // Mobil web için ağır mesh'i sadeleştir
  simplify({
    simplifier: MeshoptSimplifier,
    ratio: 0.075,
    error: 0.002
  }),
  quantize(),
  textureCompress({ resize: [512, 512], format: 'webp' }),
  center({ pivot: 'below' }),
  flatten(),
  prune()
);

scaleToHeight(doc, TARGET_HEIGHT);

writeFileSync(outPath, Buffer.from(await io.writeBinary(doc)));

console.log('--- Sonra ---');
const after = await io.readBinary(readFileSync(outPath));
console.log(JSON.stringify(inspect(after).meshes, null, 2));
console.log('Hazır:', outPath, `(${Math.round(readFileSync(outPath).length / 1024)} KB)`);

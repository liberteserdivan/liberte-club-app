import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { center, dedup, flatten, inspect, prune, textureCompress, weld } from '@gltf-transform/functions';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cupFile = process.argv[2] || 'Liberte_Cup_Meshy.glb';
const cupPath = join(root, 'public', cupFile);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.readBinary(readFileSync(cupPath));

console.log('--- Önce ---');
console.log(JSON.stringify(inspect(doc).scenes, null, 2));

const scene = doc.getRoot().getDefaultScene();
if (scene) {
  for (const node of scene.listChildren()) {
    node.setScale([1.05, 1.05, 1.05]);
  }
}

await doc.transform(
  dedup(),
  weld(),
  center({ pivot: 'below' }),
  textureCompress({ resize: [2048, 2048] }),
  flatten(),
  prune()
);

writeFileSync(cupPath, Buffer.from(await io.writeBinary(doc)));

console.log('--- Sonra ---');
const afterDoc = await io.readBinary(readFileSync(cupPath));
console.log(JSON.stringify(inspect(afterDoc).scenes, null, 2));
console.log('Hazır:', cupPath, `(${Math.round(readFileSync(cupPath).length / 1024)} KB)`);

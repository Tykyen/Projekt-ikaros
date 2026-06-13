// Universe (mapa vesmíru) obrázky uzlů → Cloudinary (webp).
// `node.img` v seedu jsou názvy souborů ('svar.jpg', 'midgard.jpg', …).
// Stáhni GDrive složku s obrázky lokálně a spusť:
//   node migration/universe-images-upload.mjs [INPUT_DIR]
// Default INPUT_DIR = C:/tmp/universe-images
// Výstup: migration/universe-images-map.json  { "svar.jpg": "https://res.cloudinary…", … }
// — mapa pro doplnění do seedu i pro mongosh fázi B (DB).

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { extname, basename, join } from 'node:path';

const BACKEND = 'C:/Matrix/ProjektIkaros/Projekt-ikaros/backend';
const MIGRATION = 'C:/Matrix/ProjektIkaros/Projekt-ikaros/migration';
const INPUT_DIR = process.argv[2] || 'C:/tmp/universe-images';
const MAP_OUT = `${MIGRATION}/universe-images-map.json`;

// cloudinary je CJS v backend/node_modules → createRequire od backend package.json
const require = createRequire(`${BACKEND}/package.json`);
const cloudinary = require('cloudinary').v2;

function loadCloudinaryUrl() {
  const env = readFileSync(`${BACKEND}/.env`, 'utf8');
  const line = env
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith('CLOUDINARY_URL='));
  if (!line) throw new Error('CLOUDINARY_URL chybí v backend/.env');
  return line.slice(line.indexOf('=') + 1).trim();
}
function configureCloudinary() {
  const u = new URL(loadCloudinaryUrl());
  cloudinary.config({
    cloud_name: u.hostname,
    api_key: decodeURIComponent(u.username),
    api_secret: decodeURIComponent(u.password),
    secure: true,
  });
  return u.hostname;
}

async function main() {
  const cloud = configureCloudinary();
  console.log(`Cloudinary cloud: ${cloud}`);
  const files = readdirSync(INPUT_DIR).filter((f) =>
    /\.(jpe?g|png|webp|gif)$/i.test(f),
  );
  console.log(`Soubory: ${files.length} v ${INPUT_DIR}`);

  const map = {};
  let ok = 0;
  for (const f of files) {
    const publicId = basename(f, extname(f)); // 'svar.jpg' → 'svar'
    try {
      const res = await cloudinary.uploader.upload(join(INPUT_DIR, f), {
        folder: 'matrix/universe',
        public_id: publicId,
        overwrite: true,
        resource_type: 'image',
        format: 'webp',
        transformation: [{ width: 2048, crop: 'limit', quality: 'auto:good' }],
      });
      map[f] = res.secure_url; // klíč = původní název souboru (= node.img)
      ok++;
      console.log(`  ✓ ${f} → ${res.secure_url}`);
    } catch (e) {
      console.error(`  ✗ ${f}: ${String(e?.message || e)}`);
    }
  }

  writeFileSync(MAP_OUT, JSON.stringify(map, null, 2));
  console.log(`\nHotovo: ${ok}/${files.length}. Mapa → ${MAP_OUT}`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});

/**
 * 21.5a — Seed komunitního herbáře z dokumentu „Lektvary herbář.docx".
 * - Načte <HERBAR_DIR>/plants.json (56 rostlin) + obrázky z <HERBAR_DIR>/images
 * - Nahraje obrázek na Cloudinary jako WebP (folder community-herbar)
 * - Vloží community rostliny (status approved, autor Superadmin) přes insertMany
 * Idempotence: dle `name` + `scope:'community'` — re-run přeskočí existující.
 *
 * Data (mimo repo, jako migrace-bestiae): C:/Matrix/ProjektIkaros/migrace-herbar
 * override přes env HERBAR_DIR.
 *
 * Spuštění (cwd = backend):
 *   npx ts-node scripts/seed-plants/index.ts --dry-run
 *   npx ts-node scripts/seed-plants/index.ts               (ostrý — Cloudinary + Mongo)
 *   npx ts-node scripts/seed-plants/index.ts --limit 5     (test)
 *   npx ts-node scripts/seed-plants/index.ts --export plants.ndjson   (Cloudinary + NDJSON, bez Mongo)
 * Pro PROD: $env:MONGODB_URI = "<PROD>" před ostrým během (jinak localhost).
 */
import * as fs from 'fs';
import * as path from 'path';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' }); // tajné override (gitignored) — sem patří PROD MONGODB_URI
dotenv.config(); // .env (dev default; nepřepíše již nastavené z .env.local)
cloudinary.config(true); // CLOUDINARY_URL z env

const HERBAR = process.env.HERBAR_DIR ?? 'C:/Matrix/ProjektIkaros/migrace-herbar';
const DRY = process.argv.includes('--dry-run');
const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg >= 0 ? parseInt(process.argv[limitArg + 1], 10) : Infinity;
const exportArg = process.argv.indexOf('--export');
const EXPORT: string | null = exportArg >= 0 ? process.argv[exportArg + 1] : null;
const AUTHOR_EMAIL = 'tykytanjunior@gmail.com';
const PLACEHOLDER = '__SEED_AUTHOR__';

const slug = (s: string): string =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

interface PlantSrc {
  name: string;
  aliases?: string;
  habitat?: string;
  usage?: string;
  rarity?: string;
  rarityNote?: string;
  images?: string[];
}

async function main() {
  let db: import('mongodb').Db | null = null;
  let col: import('mongodb').Collection | null = null;
  let authorId = PLACEHOLDER;

  if (EXPORT) {
    console.log('EXPORT rezim -> NDJSON:', EXPORT, '(authorId =', PLACEHOLDER + ')');
  } else {
    const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/ikaros';
    await mongoose.connect(uri);
    db = mongoose.connection.db!;
    let safeHost = uri;
    try {
      const u = new URL(uri);
      safeHost = `${u.protocol}//${u.host}${u.pathname}`; // bez credentials
    } catch {
      /* ponech */
    }
    console.log('DB:', safeHost, DRY ? '(DRY RUN)' : '(OSTRY)');
    const author = await db.collection('users').findOne({ email: AUTHOR_EMAIL });
    if (!author && !DRY) {
      throw new Error(
        'Autor (Superadmin) nenalezen: ' +
          AUTHOR_EMAIL +
          ' — mires na spravnou (prod) DB? Zkontroluj MONGODB_URI.',
      );
    }
    authorId = author ? String(author._id) : 'DRY-PLACEHOLDER';
    console.log('Autor:', author ? AUTHOR_EMAIL + ' -> ' + authorId : '(DRY placeholder)');
    col = db.collection('plants');
  }

  const plants: PlantSrc[] = JSON.parse(
    fs.readFileSync(path.join(HERBAR, 'plants.json'), 'utf8'),
  );
  const imgDir = path.join(HERBAR, 'images');
  const docs: Record<string, unknown>[] = [];
  let uploaded = 0;
  let skipped = 0;
  let noImage = 0;

  for (const p of plants) {
    if (docs.length >= LIMIT) break;
    if (!p.name?.trim()) continue;
    if (col && (await col.findOne({ name: p.name, scope: 'community' }))) {
      skipped++;
      continue;
    }

    let imageUrl: string | undefined;
    const imgFile = p.images?.[0];
    if (imgFile && fs.existsSync(path.join(imgDir, imgFile))) {
      if (!DRY) {
        const up = await cloudinary.uploader.upload(path.join(imgDir, imgFile), {
          folder: 'community-herbar',
          public_id: slug(p.name),
          overwrite: true,
          format: 'webp',
          resource_type: 'image',
          transformation: [{ width: 1000, height: 1200, crop: 'limit' }],
        });
        imageUrl = up.secure_url;
      }
      uploaded++;
    } else {
      noImage++;
    }

    const now = new Date();
    const doc: Record<string, unknown> = {
      scope: 'community',
      name: p.name.trim(),
      imageUrl,
      imageFocalX: null,
      imageFocalY: null,
      imageZoom: null,
      imageFit: null,
      description: '',
      suggestedPrice: null,
      status: 'approved',
      authorId,
      approvedAt: now,
      approvedBy: authorId,
      moderationHidden: false,
      statblocks: {},
      createdAt: now,
      updatedAt: now,
    };
    if (p.aliases?.trim()) doc.aliases = p.aliases.trim();
    if (p.habitat?.trim()) doc.habitat = p.habitat.trim();
    if (p.usage?.trim()) doc.usage = p.usage.trim();
    if (p.rarity?.trim()) doc.rarity = p.rarity.trim();
    if (p.rarityNote?.trim()) doc.rarityNote = p.rarityNote.trim();
    docs.push(doc);
  }

  console.log(
    `Pripraveno: ${docs.length} | nahrano obrazku: ${uploaded} | bez obrazku: ${noImage} | preskoceno: ${skipped}`,
  );

  if (EXPORT) {
    fs.writeFileSync(EXPORT, docs.map((d) => JSON.stringify(d)).join('\n') + '\n', 'utf8');
    console.log('NDJSON zapsan:', EXPORT, `(${docs.length} docs, authorId placeholder ${PLACEHOLDER})`);
  } else if (!DRY && col && docs.length) {
    const res = await col.insertMany(docs, { ordered: false });
    console.log('Vlozeno do DB:', res.insertedCount);
  } else if (DRY) {
    console.log('DRY RUN — nic se nezapsalo. Ukazka prvni:');
    console.log(JSON.stringify(docs[0], null, 2));
  }

  if (!EXPORT) await mongoose.disconnect();
}

main().catch((e) => {
  console.error('CHYBA:', e);
  process.exit(1);
});

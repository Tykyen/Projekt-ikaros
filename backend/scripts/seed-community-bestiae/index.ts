/**
 * Seed komunitního bestiáře z migrovaných JSON (VB příběh → JaD).
 * - Načte <migrace>/*.bestie.json + obrázky z <migrace>/<jméno>/{word/media|media}
 * - Nahraje portrét na Cloudinary jako WebP (folder community-bestiae)
 * - Vloží community JaD bestie (status approved) přes native insertMany
 * Idempotence: clonedFromId marker `seed:jad:<soubor>:<jméno>` — re-run přeskočí.
 *
 * Spuštění (cwd = backend):
 *   npx ts-node scripts/seed-community-bestiae/index.ts --dry-run
 *   npx ts-node scripts/seed-community-bestiae/index.ts            (ostrý)
 *   npx ts-node scripts/seed-community-bestiae/index.ts --limit 5  (test)
 */
import * as fs from 'fs';
import * as path from 'path';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import * as dotenv from 'dotenv';

dotenv.config();
cloudinary.config(true); // CLOUDINARY_URL z env

const MIG = process.env.MIGRACE_DIR ?? 'C:/Matrix/ProjektIkaros/migrace-bestiae';
const DRY = process.argv.includes('--dry-run');
const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg >= 0 ? parseInt(process.argv[limitArg + 1], 10) : Infinity;
const exportArg = process.argv.indexOf('--export');
// Export režim: nahraje obrázky na Cloudinary + zapíše NDJSON (pro mongoimport
// na serveru, kde je prod Mongo). NEpotřebuje Mongo připojení. authorId =
// placeholder `__SEED_AUTHOR__`, který se na serveru nahradí reálným _id.
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

const natSort = (a: string, b: string): number =>
  (parseInt(a.match(/\d+/)?.[0] ?? '0', 10) || 0) -
  (parseInt(b.match(/\d+/)?.[0] ?? '0', 10) || 0);

interface Beast {
  name: string;
  kind?: string;
  latin?: string;
  description?: string;
  imageIndex: number;
  systemStats: Record<string, unknown>;
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
    console.log('DB:', uri, DRY ? '(DRY RUN)' : '(OSTRY)');
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
    col = db.collection('bestiae');
  }
  const files = fs.readdirSync(MIG).filter((f) => f.endsWith('.bestie.json'));
  const docs: Record<string, unknown>[] = [];
  let uploaded = 0;
  let skipped = 0;
  let noImage = 0;

  for (const f of files) {
    const srcName = f.replace('.bestie.json', '');
    const beasts: Beast[] = JSON.parse(
      fs.readFileSync(path.join(MIG, f), 'utf8'),
    );
    const mediaDir = path.join(MIG, srcName, 'media');
    const imgs = mediaDir
      ? fs
          .readdirSync(mediaDir)
          .filter((x) => /\.(png|jpe?g|gif)$/i.test(x))
          .sort(natSort)
      : [];

    for (const b of beasts) {
      if (docs.length >= LIMIT) break;
      const marker = `seed:jad:${slug(srcName)}:${slug(b.name)}`;
      if (col && (await col.findOne({ clonedFromId: marker }))) {
        skipped++;
        continue;
      }

      let imageUrl: string | undefined;
      const imgFile = imgs[b.imageIndex - 1];
      if (imgFile) {
        if (!DRY) {
          const up = await cloudinary.uploader.upload(
            path.join(mediaDir, imgFile),
            {
              folder: 'community-bestiae',
              public_id: `${slug(srcName)}-${slug(b.name)}`,
              overwrite: true,
              format: 'webp',
              resource_type: 'image',
              transformation: [{ width: 1000, height: 1200, crop: 'limit' }],
            },
          );
          imageUrl = up.secure_url;
        }
        uploaded++;
      } else {
        noImage++;
      }

      const now = new Date();
      docs.push({
        scope: 'community',
        systemId: 'jad',
        name: b.name,
        kind: b.kind,
        latin: b.latin,
        imageUrl,
        imageFocalX: null,
        imageFocalY: null,
        imageZoom: null,
        imageFit: null,
        notes: '',
        description: b.description ?? '',
        systemStats: {},
        status: 'approved',
        authorId,
        approvedAt: now,
        approvedBy: authorId,
        deletedAt: null,
        moderationHidden: false,
        clonedFromId: marker,
        statblocks: {
          jad: {
            systemStats: b.systemStats,
            status: 'approved',
            authorId,
            createdAt: now,
          },
        },
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  console.log(
    `Pripraveno: ${docs.length} | nahrano obrazku: ${uploaded} | bez obrazku: ${noImage} | preskoceno: ${skipped}`,
  );
  if (EXPORT) {
    fs.writeFileSync(
      EXPORT,
      docs.map((d) => JSON.stringify(d)).join('\n') + '\n',
      'utf8',
    );
    console.log(
      'NDJSON zapsan:',
      EXPORT,
      `(${docs.length} docs, authorId placeholder ${PLACEHOLDER})`,
    );
  } else if (!DRY && col && docs.length) {
    const res = await col.insertMany(docs, { ordered: false });
    console.log('Vlozeno do DB:', res.insertedCount);
  } else if (DRY) {
    console.log('DRY RUN — nic se nezapsalo. Ukazka prvni:');
    console.log(
      JSON.stringify(
        { ...docs[0], description: (docs[0]?.description as string)?.slice(0, 80) + '…' },
        null,
        2,
      ),
    );
  }

  if (!EXPORT) await mongoose.disconnect();
}

main().catch((e) => {
  console.error('CHYBA:', e);
  process.exit(1);
});

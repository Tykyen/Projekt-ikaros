/* eslint-disable no-console */
import * as fs from 'fs';
import * as path from 'path';
import mongoose from 'mongoose';
import { mapLegacyItem } from './mapper';
import { buildBulkWriteOp } from './bulk-write';

// Env loading: skript NEčte .env automaticky.
// Spouštěj jako: `MONGODB_URI=... npm run migrate:news -- --input=...`
// nebo: `node --env-file=.env -r ts-node/register scripts/migrate-world-news/index.ts ...`

interface CliArgs {
  input: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let input = '';
  let dryRun = false;
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--input=')) input = arg.slice('--input='.length);
    else if (arg === '--dry-run') dryRun = true;
  }
  if (!input) {
    console.error('Použití: ts-node index.ts --input=<path.json> [--dry-run]');
    process.exit(1);
  }
  return { input, dryRun };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const inputPath = path.resolve(args.input);

  if (!fs.existsSync(inputPath)) {
    console.error(`Vstupní soubor neexistuje: ${inputPath}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf-8')) as unknown[];
  if (!Array.isArray(raw)) {
    console.error('Vstup musí být JSON pole');
    process.exit(1);
  }

  console.log(`📄 Načteno ${raw.length} položek z ${inputPath}`);
  if (args.dryRun) console.log('🧪 DRY RUN — žádný zápis do DB');

  const mapped: { _id: string; doc: Record<string, unknown> }[] = [];
  const skipped: { index: number; reason: string }[] = [];

  for (let i = 0; i < raw.length; i++) {
    const result = mapLegacyItem(raw[i]);
    if (result.ok) {
      const { _id, ...doc } = result.data;
      mapped.push({ _id, doc });
    } else {
      skipped.push({ index: i, reason: result.reason });
    }
  }

  console.log(`✅ Validních: ${mapped.length}`);
  console.log(`⏭️  Skipnutých: ${skipped.length}`);
  for (const s of skipped) {
    console.log(`   [${s.index}] ${s.reason}`);
  }

  if (args.dryRun || mapped.length === 0) {
    console.log('Hotovo (dry-run nebo nic k importu).');
    return;
  }

  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/ikaros';
  console.log(`🔌 Připojuji k Mongo: ${uri.replace(/:[^@]+@/, ':***@')}`);
  await mongoose.connect(uri);

  try {
    const collection = mongoose.connection.collection('worldnews');
    const ops = mapped.map(buildBulkWriteOp);

    const result = await collection.bulkWrite(ops, { ordered: false });
    console.log(
      `✨ Import OK — upserts: ${result.upsertedCount}, modified: ${result.modifiedCount}, matched: ${result.matchedCount}`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

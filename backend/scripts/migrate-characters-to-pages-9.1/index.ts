/* eslint-disable no-console */
/**
 * Krok 9.1 — Migrace Character → Page (sjednocení entity).
 *
 * Pro každý `Character` v každém světě vytvoří `Page` se zachováním všech
 * dat (publicBio→content, publicInfoBlocks→table, privateBio→privateContent,
 * userId→ownerUserId/isNpc→type, isLocation→type Lokace, accessRequirements,
 * customData). `characterRef.characterId` odkazuje zpět na původní Character
 * entitu, která zůstává netknutá pro 5 subdokumentů (diary/calendar/finance/
 * inventory/notes) — F7 cleanup vyčistí duplicitní pole až po stabilizaci.
 *
 * Slug-kolize: pokud Character.slug už existuje v Pages (typicky wiki stránka
 * o stejné postavě), nový Page dostane suffix `-postava` (případně `-postava-2`).
 *
 * Skript je IDEMPOTENTNÍ — pokud Page s `characterRef.characterId == char._id`
 * už existuje, character se přeskočí (skipped).
 *
 * Spouštěj:
 *   MONGODB_URI=mongodb://... ts-node scripts/migrate-characters-to-pages-9.1/index.ts [--dry-run] [--world=<id>]
 *
 * `--dry-run`  — žádný zápis, jen report
 * `--world=ID` — omezit migraci na 1 svět
 */
import mongoose from 'mongoose';

interface CliArgs {
  dryRun: boolean;
  worldFilter: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  let dryRun = false;
  let worldFilter: string | null = null;
  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg.startsWith('--world='))
      worldFilter = arg.slice('--world='.length);
  }
  return { dryRun, worldFilter };
}

interface CharacterDoc {
  _id: mongoose.Types.ObjectId;
  slug: string;
  name: string;
  worldId: string;
  userId?: string;
  isNpc?: boolean;
  isLocation?: boolean;
  imageUrl?: string;
  publicBio?: string;
  publicInfoBlocks?: Array<{ label: string; value: string }>;
  privateBio?: string;
  privateInfoBlocks?: Array<{ label: string; value: string }>;
  accessRequirements?: Array<{ type: string; value: string }>;
  customData?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

interface PageDoc {
  _id?: mongoose.Types.ObjectId;
  slug: string;
  worldId: string;
  type: string;
  title: string;
  content: string;
  imageUrl?: string;
  bigImage?: boolean;
  table?: {
    hasTable: boolean;
    title?: string;
    headers?: string[];
    values?: string[];
  };
  sections: unknown[];
  galleryImages: unknown[];
  videos: unknown[];
  menu: unknown[];
  plainText: string;
  isWoodWide: boolean;
  accessRequirements: unknown[];
  customData?: Record<string, string>;
  order: number;
  privateContent?: string;
  privateInfoBlocks?: Array<{ label: string; value: string }>;
  ownerUserId?: string;
  characterRef?: { characterId: string };
  createdAt?: Date;
  updatedAt?: Date;
}

function classifyType(char: CharacterDoc): string {
  // R2 — Character.isLocation se po sjednocení mapuje na existující PageType
  // 'Lokace' (ne na nový persona-typ). PostavaHrace má userId, NPC bez.
  if (char.isLocation) return 'Lokace';
  if (char.isNpc) return 'NPC';
  return 'Postava hráče';
}

function infoBlocksToTable(
  blocks?: Array<{ label: string; value: string }>,
): PageDoc['table'] | undefined {
  if (!blocks || blocks.length === 0) return undefined;
  return {
    hasTable: true,
    headers: blocks.map((b) => b.label ?? ''),
    values: blocks.map((b) => b.value ?? ''),
  };
}

/** Naivní plain-text extrakce z HTML — pro plainText indexing fallback. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function findFreeSlug(
  collection: mongoose.mongo.Collection,
  worldId: string,
  baseSlug: string,
): Promise<string> {
  const exists = async (s: string): Promise<boolean> =>
    (await collection.countDocuments({ worldId, slug: s })) > 0;
  if (!(await exists(baseSlug))) return baseSlug;
  const candidate = `${baseSlug}-postava`;
  if (!(await exists(candidate))) return candidate;
  let i = 2;
  while (await exists(`${candidate}-${i}`)) i++;
  return `${candidate}-${i}`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/ikaros';

  console.log(`🔌 Připojuji k Mongo: ${uri.replace(/:[^@]+@/, ':***@')}`);
  if (args.dryRun) console.log('🧪 DRY RUN — žádný zápis do DB');
  if (args.worldFilter) console.log(`🌍 Filter na svět: ${args.worldFilter}`);

  await mongoose.connect(uri);

  try {
    const charactersCol = mongoose.connection.collection('characters');
    const pagesCol = mongoose.connection.collection('pages');

    const filter: Record<string, unknown> = {};
    if (args.worldFilter) filter.worldId = args.worldFilter;

    const characters = (await charactersCol
      .find(filter)
      .toArray()) as unknown as CharacterDoc[];

    console.log(`📋 Načteno ${characters.length} postav`);

    let created = 0;
    let skipped = 0;
    let collisions = 0;

    for (const char of characters) {
      const charId = String(char._id);

      // Idempotence — Page s characterRef.characterId == char._id už existuje?
      const existing = await pagesCol.findOne({
        worldId: char.worldId,
        'characterRef.characterId': charId,
      });
      if (existing) {
        skipped++;
        continue;
      }

      const targetSlug = await findFreeSlug(
        pagesCol as unknown as mongoose.mongo.Collection,
        char.worldId,
        char.slug,
      );
      if (targetSlug !== char.slug) {
        collisions++;
        console.log(
          `   ⚠️ ${char.worldId}/${char.slug} → /${targetSlug} (kolize s wiki)`,
        );
      }

      const type = classifyType(char);
      const isPersona = type === 'Postava hráče' || type === 'NPC';
      const content = char.publicBio ?? '';

      const pageDoc: PageDoc = {
        slug: targetSlug,
        worldId: char.worldId,
        type,
        title: char.name,
        content,
        imageUrl: char.imageUrl,
        bigImage: false,
        table: infoBlocksToTable(char.publicInfoBlocks),
        sections: [],
        galleryImages: [],
        videos: [],
        menu: [],
        plainText: stripHtml(content),
        isWoodWide: false,
        accessRequirements: char.accessRequirements ?? [],
        customData: (char.customData as Record<string, string>) ?? {},
        order: 0,
        // Persona-only pole
        ...(isPersona && {
          privateContent: char.privateBio ?? '',
          privateInfoBlocks: char.privateInfoBlocks ?? [],
          characterRef: { characterId: charId },
        }),
        ...(type === 'Postava hráče' &&
          char.userId && { ownerUserId: char.userId }),
        createdAt: char.createdAt ?? new Date(),
        updatedAt: char.updatedAt ?? new Date(),
      };

      if (args.dryRun) {
        console.log(
          `   📝 ${char.worldId}/${targetSlug} (${type}, owner=${char.userId ?? '—'})`,
        );
        created++;
        continue;
      }

      await pagesCol.insertOne(pageDoc as unknown as Record<string, unknown>);
      created++;
    }

    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log(`✨ Hotovo`);
    console.log(`   Vytvořeno Page entries:  ${created}`);
    console.log(`   Přeskočeno (existuje):   ${skipped}`);
    console.log(`   Slug kolize (rename):    ${collisions}`);
    console.log('═══════════════════════════════════════════');
    console.log('');
    console.log(
      'ℹ️  Character entity zůstává netknutá (subdokumenty: diary/calendar/finance/inventory/notes).',
    );
    console.log(
      'ℹ️  Po stabilizaci F7 cleanup vyčistí duplicitní pole z Character.',
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

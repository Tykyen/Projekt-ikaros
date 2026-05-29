/* eslint-disable no-console */
/**
 * Migrace NpcTemplate (8.4) → Bestie (10.2d).
 *
 * Důvod: "Šablony NPC" (kolekce `npcTemplates`, plochý statblok) a "Bestiář"
 * (kolekce `bestiae`, per-system `systemStats`) byly dvě nepropojené knihovny.
 * Taktická mapa čte jen `bestiae`. Sjednocujeme na `bestiae`; tahle migrace
 * přenese existující world-scoped šablony.
 *
 * Mapování plochých statů → systemStats (klíče sdílené matrix i drd2 schématem):
 *   maxHp          → health.max
 *   armor          → armor
 *   injury         → injury
 *   movement       → movement
 *   initiativeBase → initiative.base
 *   abilities      → systemStats.abilities (matrix drží abilities v systemStats)
 *
 * Scope: world-scoped (worldId != null) → Bestie scope 'world', systemId z
 * world.system. Globální šablony (worldId == null) se NEMIGRUJÍ (statblok je
 * system-specific, globál nemá systém) — jen zalogují.
 *
 * Idempotence: `clonedFromId = "npctpl:<id>"`; opakované spuštění přeskočí už
 * migrované. Zdrojová kolekce `npcTemplates` zůstává nedotčená (záloha).
 *
 * Spuštění:
 *   MONGODB_URI=... npx ts-node scripts/migrate-npc-templates-to-bestiae/index.ts --dry-run
 *   MONGODB_URI=... npx ts-node scripts/migrate-npc-templates-to-bestiae/index.ts
 */
import mongoose from 'mongoose';

interface CliArgs {
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let dryRun = false;
  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') dryRun = true;
  }
  return { dryRun };
}

const STAT_MAP: Record<string, string> = {
  maxHp: 'health.max',
  armor: 'armor',
  injury: 'injury',
  movement: 'movement',
  initiativeBase: 'initiative.base',
};

interface NpcTemplateDoc {
  _id: mongoose.Types.ObjectId;
  worldId?: string | null;
  name: string;
  imageUrl?: string;
  notes?: string;
  maxHp?: number;
  armor?: number;
  injury?: number;
  movement?: number;
  initiativeBase?: number;
  abilities?: Array<{ label: string; value: string }>;
  deletedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface WorldDoc {
  _id: mongoose.Types.ObjectId;
  name: string;
  system: string;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/ikaros';
  console.log(`🔌 Mongo: ${uri.replace(/:[^@]+@/, ':***@')}`);
  if (args.dryRun) console.log('🧪 DRY RUN — žádný zápis do DB');

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No db connection');

  const tplCol = db.collection<NpcTemplateDoc>('npcTemplates');
  const worldCol = db.collection<WorldDoc>('worlds');
  const bestieCol = db.collection('bestiae');

  try {
    const tpls = await tplCol.find({ deletedAt: null }).toArray();
    console.log(`📄 Aktivních npcTemplates: ${tpls.length}`);

    const worldCache = new Map<string, WorldDoc | null>();
    const toInsert: Record<string, unknown>[] = [];
    let skippedGlobal = 0;
    let skippedExisting = 0;
    let skippedNoWorld = 0;

    for (const tpl of tpls) {
      const id = String(tpl._id);

      if (!tpl.worldId) {
        skippedGlobal++;
        console.log(`   ⏭️  GLOBAL (nemigruje se): "${tpl.name}" [${id}]`);
        continue;
      }

      // Idempotence — už migrováno?
      const marker = `npctpl:${id}`;
      const exists = await bestieCol.findOne({ clonedFromId: marker });
      if (exists) {
        skippedExisting++;
        console.log(`   ⏭️  UŽ MIGROVÁNO: "${tpl.name}" [${id}]`);
        continue;
      }

      // World → systemId
      const wid = String(tpl.worldId);
      let world = worldCache.get(wid);
      if (world === undefined) {
        try {
          world = await worldCol.findOne({
            _id: new mongoose.Types.ObjectId(wid),
          });
        } catch {
          world = null;
        }
        worldCache.set(wid, world);
      }
      if (!world) {
        skippedNoWorld++;
        console.log(
          `   ⚠️  SVĚT NENALEZEN (skip): "${tpl.name}" [${id}] world=${wid}`,
        );
        continue;
      }
      const systemId = world.system;

      // Ploché staty → systemStats
      const systemStats: Record<string, unknown> = {};
      for (const [flat, key] of Object.entries(STAT_MAP)) {
        const v = (tpl as Record<string, unknown>)[flat];
        if (typeof v === 'number') systemStats[key] = v;
      }
      // Abilities — matrix drží v systemStats; ponecháme i top-level kvůli schématu.
      const abilities = Array.isArray(tpl.abilities) ? tpl.abilities : [];
      systemStats.abilities = abilities;

      const now = new Date();
      toInsert.push({
        scope: 'world',
        systemId,
        worldId: wid,
        name: tpl.name,
        imageUrl: tpl.imageUrl,
        notes: tpl.notes ?? '',
        abilities,
        systemStats,
        clonedFromId: marker,
        deletedAt: null,
        createdAt: tpl.createdAt ?? now,
        updatedAt: now,
      });
      console.log(
        `   ✅ MAPOVÁNO: "${tpl.name}" [${id}] → world="${world.name}" system="${systemId}" stats=${JSON.stringify(systemStats)}`,
      );
    }

    console.log('');
    console.log(`✨ K vložení: ${toInsert.length}`);
    console.log(`⏭️  Global skip: ${skippedGlobal}`);
    console.log(`⏭️  Už migrováno: ${skippedExisting}`);
    console.log(`⚠️  Svět nenalezen: ${skippedNoWorld}`);

    if (args.dryRun) {
      console.log('Hotovo (dry-run).');
      return;
    }
    if (toInsert.length === 0) {
      console.log('Nic k vložení.');
      return;
    }

    const result = await bestieCol.insertMany(toInsert, { ordered: false });
    console.log(`✅ Vloženo do bestiae: ${result.insertedCount}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

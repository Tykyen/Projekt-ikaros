/**
 * Spec 9.2b — Backfill multi-config kalendáře pro existující světy.
 *
 * Pro každý World v DB:
 *   1. Pokud existuje doc v `world_calendar_configs` bez `slug` (singular schema
 *      pre-9.2b), set slug='default', name='Default kalendář', přidat prázdné
 *      `seasons[]`, `epochOffset=0`. Sjednotit `celestialBodies` shape
 *      (drop typed union, převést na 9.2a shape).
 *   2. Pokud World nemá žádný config v kolekci → vytvoř Gregorian default
 *      (shape parita s FE GREGORIAN_DEFAULT_CONFIG).
 *   3. Set `World.defaultCalendarConfigSlug = 'gregorian'` (nebo 'default'
 *      pokud byl scénář 1) + `World.timelineEpoch = 0`.
 *
 * Idempotent: re-run no-op po dokončení (filter na chybějící
 * defaultCalendarConfigSlug nebo nedotčené world_calendar_configs docs).
 *
 * Default dry-run, --apply pro produkční zápis.
 *
 *   MONGODB_URI=mongodb://... npx tsx scripts/backfill-multi-calendar-config-9.2b/index.ts [--apply] [--world=<id>]
 */
import mongoose from 'mongoose';

interface CliArgs {
  apply: boolean;
  worldFilter: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  let apply = false;
  let worldFilter: string | null = null;
  for (const arg of argv.slice(2)) {
    if (arg === '--apply') apply = true;
    else if (arg.startsWith('--world='))
      worldFilter = arg.slice('--world='.length);
  }
  return { apply, worldFilter };
}

// Mirror src/modules/world-calendar-config/gregorian-default.ts
const MOON_EPOCH_REFERENCE_ABSDAY = 730490;

const GREGORIAN_TEMPLATE = {
  slug: 'gregorian',
  name: 'Gregoriánský kalendář',
  hoursPerDay: 24,
  daysOfWeek: ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'],
  months: [
    { name: 'Leden', daysCount: 31 },
    { name: 'Únor', daysCount: 28 },
    { name: 'Březen', daysCount: 31 },
    { name: 'Duben', daysCount: 30 },
    { name: 'Květen', daysCount: 31 },
    { name: 'Červen', daysCount: 30 },
    { name: 'Červenec', daysCount: 31 },
    { name: 'Srpen', daysCount: 31 },
    { name: 'Září', daysCount: 30 },
    { name: 'Říjen', daysCount: 31 },
    { name: 'Listopad', daysCount: 30 },
    { name: 'Prosinec', daysCount: 31 },
  ],
  celestialBodies: [
    {
      id: 'moon',
      name: 'Měsíc',
      orbitalPeriodDays: 29.5306,
      color: '#c0c8d0',
      epochOffset: MOON_EPOCH_REFERENCE_ABSDAY,
    },
  ],
  seasons: [
    {
      id: 'jaro',
      name: 'Jaro',
      startMonthIndex: 2,
      startDay: 21,
      color: '#7cb342',
      icon: '🌸',
    },
    {
      id: 'leto',
      name: 'Léto',
      startMonthIndex: 5,
      startDay: 21,
      color: '#fbc02d',
      icon: '☀️',
    },
    {
      id: 'podzim',
      name: 'Podzim',
      startMonthIndex: 8,
      startDay: 23,
      color: '#e65100',
      icon: '🍂',
    },
    {
      id: 'zima',
      name: 'Zima',
      startMonthIndex: 11,
      startDay: 21,
      color: '#42a5f5',
      icon: '❄️',
    },
  ],
  epochOffset: 0,
};

/**
 * Převod legacy CelestialBody shape (discriminated union) na 9.2a uniform shape.
 * Pro 'moon' použij `cycleLength`, pro ostatní typy fallback default
 * (orbitalPeriod nebo 29.5).
 */
function convertLegacyCelestialBody(
  legacy: Record<string, unknown>,
): Record<string, unknown> {
  const type = legacy.type as string;
  const config = (legacy.config as Record<string, unknown>) ?? {};
  let orbitalPeriodDays = 29.5306;
  if (type === 'moon' && typeof config.cycleLength === 'number') {
    orbitalPeriodDays = config.cycleLength;
  } else if (type === 'planet' && typeof config.orbitalPeriod === 'number') {
    orbitalPeriodDays = config.orbitalPeriod;
  } else if (type === 'comet' && typeof config.periodYears === 'number') {
    orbitalPeriodDays = config.periodYears * 365;
  } else if (type === 'other' && typeof config.cycleLength === 'number') {
    orbitalPeriodDays = config.cycleLength;
  }
  return {
    id: (typeof legacy.id === 'string' && legacy.id) || `body-${Date.now()}`,
    name: (typeof legacy.name === 'string' && legacy.name) || 'Těleso',
    orbitalPeriodDays,
    color: '#c0c8d0',
    epochOffset: 0,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/ikaros';

  console.log(`🔌 Připojuji k Mongo: ${uri.replace(/:[^@]+@/, ':***@')}`);
  if (!args.apply)
    console.log(
      '🧪 DRY RUN — žádný zápis do DB (použij --apply pro skutečnou migraci)',
    );
  if (args.worldFilter) console.log(`🌍 Filter na svět: ${args.worldFilter}`);

  await mongoose.connect(uri);

  try {
    const worldsCol = mongoose.connection.collection('worlds');
    const configsCol = mongoose.connection.collection('world_calendar_configs');

    const worldFilter: Record<string, unknown> = {};
    if (args.worldFilter) worldFilter._id = args.worldFilter;

    const worlds = await worldsCol
      .find(worldFilter, {
        projection: {
          _id: 1,
          name: 1,
          defaultCalendarConfigSlug: 1,
          timelineEpoch: 1,
        },
      })
      .toArray();

    console.log('');
    console.log(`📋 Worlds k inspekci: ${worlds.length}`);
    console.log('');

    let migratedLegacy = 0;
    let seededGregorian = 0;
    let alreadyDone = 0;
    let worldUpdated = 0;

    for (const world of worlds) {
      const worldId = String(world._id);
      const worldName = (world.name as string) ?? worldId;

      const existingConfigs = await configsCol.find({ worldId }).toArray();

      let chosenSlug = 'gregorian';

      if (existingConfigs.length > 0) {
        const hasNoSlug = existingConfigs.find((c) => !c.slug);
        if (hasNoSlug) {
          // Scénář 1: legacy singular config bez `slug` field.
          if (!args.apply) {
            console.log(
              `   [dry] ${worldName} → migrace legacy config (slug='default')`,
            );
          } else {
            const legacyBodies =
              (hasNoSlug.celestialBodies as Record<string, unknown>[]) ?? [];
            const newBodies = legacyBodies.map(convertLegacyCelestialBody);
            await configsCol.updateOne(
              { _id: hasNoSlug._id },
              {
                $set: {
                  slug: 'default',
                  name: 'Default kalendář',
                  celestialBodies: newBodies,
                  seasons: [],
                  epochOffset: 0,
                },
              },
            );
            console.log(
              `   [apply] ${worldName} → legacy config migrated → slug='default'`,
            );
          }
          migratedLegacy++;
          chosenSlug = 'default';
        } else {
          // Už nějaký config s slug existuje. Není co dělat na configs side.
          const hasGregorian = existingConfigs.find(
            (c) => c.slug === 'gregorian',
          );
          chosenSlug = hasGregorian
            ? 'gregorian'
            : (existingConfigs[0].slug as string);
        }
      } else {
        // Scénář 3: svět nemá žádný calendar config → seed Gregorian.
        if (!args.apply) {
          console.log(`   [dry] ${worldName} → seed Gregorian default`);
        } else {
          await configsCol.insertOne({
            worldId,
            ...GREGORIAN_TEMPLATE,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          console.log(`   [apply] ${worldName} → Gregorian seeded`);
        }
        seededGregorian++;
      }

      // Update World pole.
      const needsWorldUpdate =
        world.defaultCalendarConfigSlug !== chosenSlug ||
        world.timelineEpoch !== 0;
      if (needsWorldUpdate) {
        if (!args.apply) {
          console.log(
            `   [dry] ${worldName} → World.defaultCalendarConfigSlug='${chosenSlug}', timelineEpoch=0`,
          );
        } else {
          await worldsCol.updateOne(
            { _id: world._id },
            {
              $set: {
                defaultCalendarConfigSlug: chosenSlug,
                timelineEpoch: 0,
              },
              $unset: {
                // Drop legacy inline calendarConfig (9.2b-I konsolidace).
                calendarConfig: '',
              },
            },
          );
          console.log(
            `   [apply] ${worldName} → World updated (defaultSlug=${chosenSlug})`,
          );
        }
        worldUpdated++;
      } else {
        alreadyDone++;
      }
    }

    console.log('');
    console.log('───────────────────────────────────────────');
    console.log(`Worlds celkem:                 ${worlds.length}`);
    console.log(`  → legacy config migrated:    ${migratedLegacy}`);
    console.log(`  → Gregorian seeded:          ${seededGregorian}`);
    console.log(`  → World fields updated:      ${worldUpdated}`);
    console.log(`  → Already done (no-op):      ${alreadyDone}`);

    if (!args.apply) {
      console.log('');
      console.log('🧪 Dry run dokončen. Pro reálný zápis spusť s --apply.');
    } else {
      console.log('');
      console.log('✅ Migrace dokončena.');
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('❌ Migrace selhala:', err);
  process.exitCode = 1;
});

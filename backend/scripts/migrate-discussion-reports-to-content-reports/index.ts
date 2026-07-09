import mongoose from 'mongoose';
import {
  dedupeKey,
  mapLegacyReport,
  type ContentReportDoc,
  type LegacyDiscussionReport,
} from './mapper';

// Spouštěj: `MONGODB_URI=... npm run migrate:discussion-reports [-- --dry-run]`
//
// B4d — zkopíruje existující `ikaros_discussion_reports` do generické kolekce
// `content_reports` (modul `moderation`). Legacy kolekci NEMAŽE (audit stopa).
// Idempotentní — už zmigrované reporty (dle dvojice targetId + createdAtUtc)
// přeskočí, takže re-run nevytvoří duplikáty.

function parseArgs(argv: string[]): { dryRun: boolean } {
  return { dryRun: argv.slice(2).includes('--dry-run') };
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs(process.argv);
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/ikaros';
  console.log(`🔌 Připojuji k Mongo: ${uri.replace(/:[^@]+@/, ':***@')}`);
  await mongoose.connect(uri);

  try {
    const legacyCol = mongoose.connection.collection(
      'ikaros_discussion_reports',
    );
    const targetCol = mongoose.connection.collection('content_reports');

    const legacyTotal = await legacyCol.countDocuments();
    console.log(
      `📄 Legacy reportů v ikaros_discussion_reports: ${legacyTotal}`,
    );
    if (legacyTotal === 0) {
      console.log('✅ Nic k migraci.');
      return;
    }

    // Idempotence — načti existující content_report klíče (targetId|createdAtUtc)
    // pro discussion_post, ať re-run nevytvoří duplikáty.
    const existing = new Set<string>();
    const existingCursor = targetCol.find(
      { targetType: 'discussion_post' },
      { projection: { targetId: 1, createdAtUtc: 1 } },
    );
    for await (const doc of existingCursor) {
      const d = doc as { targetId?: string; createdAtUtc?: Date };
      if (d.targetId && d.createdAtUtc) {
        existing.add(dedupeKey(d.targetId, d.createdAtUtc));
      }
    }
    console.log(`🔎 Už zmigrovaných discussion_post reportů: ${existing.size}`);

    const cursor = legacyCol.find<LegacyDiscussionReport>({});
    let toInsert: ContentReportDoc[] = [];
    let skipped = 0;
    let inserted = 0;

    const flush = async (): Promise<void> => {
      if (toInsert.length === 0) return;
      if (!dryRun) {
        const res = await targetCol.insertMany(toInsert, { ordered: false });
        inserted += res.insertedCount;
      } else {
        inserted += toInsert.length;
      }
      toInsert = [];
    };

    for await (const legacy of cursor) {
      const key = dedupeKey(legacy.postId, legacy.createdAtUtc);
      if (existing.has(key)) {
        skipped += 1;
        continue;
      }
      // Chraň proti duplikátům i v rámci jednoho běhu (dva legacy se stejným klíčem).
      existing.add(key);
      toInsert.push(mapLegacyReport(legacy));
      if (toInsert.length >= 500) await flush();
    }
    await flush();

    console.log(
      `${dryRun ? '🧪 DRY RUN — ' : '✨ '}Migrace: k vložení ${inserted}, přeskočeno (už migrováno) ${skipped}.`,
    );
    if (dryRun) console.log('🧪 DRY RUN — žádný zápis do DB.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

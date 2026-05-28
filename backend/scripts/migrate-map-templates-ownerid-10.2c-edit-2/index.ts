/* eslint-disable no-console */
/**
 * 10.2c-edit-2 — Backfill ownerId na existující `mapTemplates`.
 *
 * Spec: docs/arch/maps/library-snapshot/security.md § Migrace.
 *
 * Důvod: nový `MapTemplate.ownerId` (required) musí být na všech existujících
 * dokumentech PŘED nasazením nové schemy. Bez backfillu by Mongoose
 * `required: true` zlomil load všech dokumentů bez ownerId.
 *
 * Default: pro všechny šablony bez ownerId → set `ownerId = Tyky (Superadmin)`.
 * Tyky je default owner, který později může rozdat šablony jiným PJ ručně
 * (Admin/Superadmin bypass v API umožňuje editaci cizích šablon).
 *
 * **IDEMPOTENTNÍ** — filtr `ownerId: { $exists: false }` zajistí, že
 * re-spuštění na již migrovaných dokumentech nic neudělá.
 *
 * Default je dry-run. Pro skutečný zápis přidej `--apply`.
 *
 * Spouštěj:
 *   MONGODB_URI=mongodb://... npx tsx scripts/migrate-map-templates-ownerid-10.2c-edit-2/index.ts [--apply]
 *
 * Alternativní owner: --owner-email=foo@bar.cz (default: tykytanjunior@gmail.com)
 */
import mongoose from 'mongoose';

interface CliArgs {
  apply: boolean;
  ownerEmail: string;
}

function parseArgs(argv: string[]): CliArgs {
  let apply = false;
  let ownerEmail = 'tykytanjunior@gmail.com';
  for (const arg of argv.slice(2)) {
    if (arg === '--apply') apply = true;
    else if (arg.startsWith('--owner-email='))
      ownerEmail = arg.slice('--owner-email='.length);
  }
  return { apply, ownerEmail };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/ikaros';

  console.log(`🔌 Připojuji k Mongo: ${uri.replace(/:[^@]+@/, ':***@')}`);
  if (!args.apply)
    console.log(
      '🧪 DRY RUN — žádný zápis do DB (použij --apply pro skutečnou migraci)',
    );
  console.log(`👤 Default owner email: ${args.ownerEmail}`);

  await mongoose.connect(uri);

  try {
    const usersCol = mongoose.connection.collection('users');
    const templatesCol = mongoose.connection.collection('mapTemplates');

    // 1. Najít Tykyho (nebo --owner-email override)
    const owner = await usersCol.findOne(
      { email: args.ownerEmail },
      { projection: { _id: 1, email: 1, username: 1 } },
    );
    if (!owner) {
      throw new Error(
        `Owner user s emailem "${args.ownerEmail}" nenalezen — abort migrace.`,
      );
    }
    const ownerId = (owner._id as { toString(): string }).toString();
    console.log('');
    console.log(
      `✅ Default owner resolved: ${args.ownerEmail} → ${ownerId} (${(owner.username as string) ?? '<no-username>'})`,
    );

    // 2. Spočítat dotčené šablony
    const filter = { ownerId: { $exists: false } };
    const count = await templatesCol.countDocuments(filter);
    console.log('');
    console.log(`📋 Šablony bez ownerId: ${count}`);

    if (count === 0) {
      console.log('✅ Nic k migraci — všechny mapTemplates už mají ownerId.');
      return;
    }

    if (!args.apply) {
      console.log(
        `🧪 DRY RUN — ${count} dokumentů by dostalo ownerId=${ownerId}, createdAt+updatedAt=now`,
      );
      // Vypsat sample do max 5 dokumentů
      const sample = await templatesCol
        .find(filter, { projection: { _id: 1, name: 1 } })
        .limit(5)
        .toArray();
      console.log(
        `📌 Sample (max 5):`,
        sample.map((d) => ({
          id: (d._id as { toString(): string }).toString(),
          name: (d.name as string) ?? '<no-name>',
        })),
      );
      return;
    }

    // 3. UpdateMany (apply)
    const now = new Date();
    const result = await templatesCol.updateMany(filter, {
      $set: { ownerId, createdAt: now, updatedAt: now },
    });
    console.log('');
    console.log(`✅ Updated: ${result.modifiedCount} dokumentů`);

    // 4. Verify zero
    const remaining = await templatesCol.countDocuments(filter);
    if (remaining > 0) {
      throw new Error(
        `Migrace neúplná: ${remaining} dokumentů stále bez ownerId — manuální zásah nutný.`,
      );
    }
    console.log('✅ Audit OK — 0 dokumentů bez ownerId v Mongo.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error('❌ Migrace selhala:', e);
  process.exit(1);
});

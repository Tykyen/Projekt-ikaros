#!/usr/bin/env node
/**
 * Spec 26.6 (D11) — vyhodnocení aktivačního trychtýře Vypravěče (04 §5.6,
 * 05 §9). Beta = ruční týdenní odečet; admin UI až v2.
 *
 * Trychtýř per persona: registrace (nové UserOnboardingState po nasazení)
 * → volba persony → start cesty → krok 1 → aha (PJ: svět + první NPC)
 * → sociální akce → dokončení. Návratovost D2/D7 se počítá TADY z rozdílu
 * createdAt/updatedAt UserOnboardingState (NE z FE eventů — FE neví, že jde
 * o návrat, a při nepřihlášení by event nikdy neodešel).
 * Obsahové díry: search_miss / no_topic / feedback_minus per refId/query.
 *
 * Spuštění: MONGODB_URI=... node scripts/vypravec-funnel.mjs [--days 14]
 */
import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/ikaros';
const daysArg = process.argv.indexOf('--days');
const days = daysArg > -1 ? Number(process.argv[daysArg + 1]) || 14 : 14;
const od = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

await mongoose.connect(uri);
const db = mongoose.connection.db;
const onboarding = db.collection('user_onboarding');
const telemetry = db.collection('vypravec_telemetry');

const stavy = await onboarding
  .find({ createdAt: { $gte: od }, backfilled: { $ne: true } })
  .toArray();

const DEN = 24 * 60 * 60 * 1000;
const cisla = {
  celkem: stavy.length,
  persona: { pj: 0, hrac: 0, worldbuilder: 0, zadna: 0 },
  cestaStart: 0,
  krok1: 0,
  aha: 0,
  socialni: 0,
  dokonceno: 0,
  d2: 0,
  d7: 0,
};

// Revize 07/23: generace klíčů (D-079) — progres cesty žije pod
// 'pj-start' NEBO 'pj-start~n'; bereme nejvyšší generaci.
function progresCesty(s, baseId) {
  let nej = null;
  let nejN = -1;
  for (const [k, v] of Object.entries(s.journeys ?? {})) {
    const [zaklad, gen] = k.split('~');
    if (zaklad !== baseId) continue;
    const n = gen ? Number(gen) || 0 : 0;
    if (n > nejN) {
      nejN = n;
      nej = v;
    }
  }
  return nej;
}

for (const s of stavy) {
  cisla.persona[s.persona ?? 'zadna'] += 1;
  // Trychtýře ostatních cest (hrac/wb/tm) — dřív skript měřil jen PJ.
  for (const [baseId, pocitadlo] of [
    ['hrac-start', 'hracCesta'],
    ['wb-start', 'wbCesta'],
    ['tm-vycvik', 'tmCesta'],
    ['hrac-ve-svete', 'hracVeSveteCesta'],
  ]) {
    const p = progresCesty(s, baseId);
    if (!p) continue;
    cisla[pocitadlo] = cisla[pocitadlo] ?? { start: 0, kroky: 0, hotovo: 0 };
    cisla[pocitadlo].start += 1;
    const kk = Object.keys(p.steps ?? {});
    cisla[pocitadlo].kroky += kk.length;
    const celkem = {
      'hrac-start': 2,
      'wb-start': 4,
      'tm-vycvik': 5,
      'hrac-ve-svete': 3,
    }[baseId];
    if (kk.length >= celkem) cisla[pocitadlo].hotovo += 1;
  }
  const j = progresCesty(s, 'pj-start');
  if (j) {
    cisla.cestaStart += 1;
    const kroky = Object.keys(j.steps ?? {});
    if (kroky.includes('pj:zaloz-svet') || kroky.includes('pj.zaloz-svet'))
      cisla.krok1 += 1;
    if (
      (kroky.includes('pj:zaloz-svet') || kroky.includes('pj.zaloz-svet')) &&
      (kroky.includes('pj:prvni-npc') || kroky.includes('pj.prvni-npc'))
    )
      cisla.aha += 1;
    if (kroky.includes('pj:napis-do-sveta') || kroky.includes('pj.napis-do-sveta'))
      cisla.socialni += 1;
    if (kroky.length >= 5) cisla.dokonceno += 1;
  }
  // návratovost: updatedAt − createdAt (aspoň jedna aktivita v okně)
  const zivot = new Date(s.updatedAt).getTime() - new Date(s.createdAt).getTime();
  if (zivot >= 1 * DEN) cisla.d2 += 1;
  if (zivot >= 6 * DEN) cisla.d7 += 1;
}

const diry = await telemetry
  .aggregate([
    {
      $match: {
        createdAt: { $gte: od },
        event: { $in: ['search_miss', 'no_topic', 'feedback_minus'] },
      },
    },
    {
      $group: {
        _id: { event: '$event', kde: { $ifNull: ['$query', '$refId'] } },
        n: { $sum: 1 },
      },
    },
    { $sort: { n: -1 } },
    { $limit: 20 },
  ])
  .toArray();

const pct = (n, z) => (z ? `${n} (${Math.round((100 * n) / z)} %)` : '0');
console.log(`\n=== Vypravěč — trychtýř za ${days} dní (nové účty, bez backfillu) ===`);
console.log(`nové stavy:        ${cisla.celkem}`);
console.log(
  `persona:           pj ${cisla.persona.pj} · hrac ${cisla.persona.hrac} · worldbuilder ${cisla.persona.worldbuilder} · bez volby ${cisla.persona.zadna}`,
);
console.log(`start cesty PJ:    ${pct(cisla.cestaStart, cisla.celkem)}`);
console.log(`krok 1 (svět):     ${pct(cisla.krok1, cisla.cestaStart)}`);
console.log(`aha (svět+NPC):    ${pct(cisla.aha, cisla.cestaStart)}`);
console.log(`sociální (zpráva): ${pct(cisla.socialni, cisla.cestaStart)}`);
console.log(`dokončená cesta:   ${pct(cisla.dokonceno, cisla.cestaStart)}  (cíl ~70 %)`);
console.log(`návrat D2 / D7:    ${pct(cisla.d2, cisla.celkem)} / ${pct(cisla.d7, cisla.celkem)}`);
console.log(`\n=== Obsahové díry (top 20: search_miss / no_topic / feedback−) ===`);
for (const d of diry)
  console.log(`${String(d.n).padStart(4)} × ${d._id.event}  ${d._id.kde ?? '—'}`);
if (!diry.length) console.log('(žádné — zatím ticho)');

await mongoose.disconnect();

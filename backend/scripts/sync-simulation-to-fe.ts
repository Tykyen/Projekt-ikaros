#!/usr/bin/env ts-node
/**
 * Sync skript — kopíruje BE simulation modul do FE weatherSimulation.
 *
 * Důvod: BE je master pro variance/Markov logiku. FE má 1:1 kopii pro trial preview.
 * Parity test gate v CI obou repos chytá drift.
 *
 * Použití:
 *   ts-node backend/scripts/sync-simulation-to-fe.ts
 *
 * Předpoklad: FE checkout existuje vedle BE jako `../Projekt-ikaros-FE/`.
 * Konfigurovatelné přes env var IKAROS_FE_PATH.
 */

import * as fs from 'fs';
import * as path from 'path';

const BE_SIM_DIR = path.resolve(
  __dirname,
  '../src/modules/world-weather/simulation',
);
// Default: FE je sibling-of-grandparent (BE = c:/.../ProjektIkaros/Projekt-ikaros, FE = c:/.../ProjektIkaros/Projekt-ikaros-FE)
const FE_REL = process.env.IKAROS_FE_PATH ?? '../../../Projekt-ikaros-FE';
const FE_SIM_DIR = path.resolve(
  __dirname,
  FE_REL,
  'src/features/world/lib/weatherSimulation',
);

const FILES = [
  'types.ts',
  'gaussianRandom.ts',
  'seasonalInterp.ts',
  'koppenStdDev.ts',
  'markovMatrices.ts',
  'markovTransition.ts',
  'varianceModel.ts',
  'climateEpochs.ts',
  'index.ts',
];

const FIXTURES = ['__fixtures__/parity-fixtures.ts'];

function ensureDir(p: string): void {
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
}

function copyFile(src: string, dst: string): void {
  if (!fs.existsSync(src)) {
    console.error(`✗ Source neexistuje: ${src}`);
    process.exit(1);
  }
  const content = fs.readFileSync(src, 'utf-8');
  ensureDir(path.dirname(dst));
  fs.writeFileSync(dst, content, 'utf-8');
  console.log(`✓ ${path.basename(src)} → ${dst.replace(/\\/g, '/')}`);
}

function main(): void {
  console.log('\n=== Sync simulation: BE → FE ===\n');
  console.log(`BE: ${BE_SIM_DIR}`);
  console.log(`FE: ${FE_SIM_DIR}\n`);

  // Pre-flight: ověř FE checkout existuje
  if (!fs.existsSync(path.resolve(__dirname, FE_REL))) {
    console.error(
      `✗ FE checkout nenalezen: ${path.resolve(__dirname, FE_REL)}`,
    );
    console.error(
      '  Nastavit IKAROS_FE_PATH env var nebo umístit FE vedle BE.',
    );
    process.exit(1);
  }

  ensureDir(FE_SIM_DIR);

  for (const f of FILES) {
    copyFile(path.join(BE_SIM_DIR, f), path.join(FE_SIM_DIR, f));
  }

  for (const f of FIXTURES) {
    copyFile(path.join(BE_SIM_DIR, f), path.join(FE_SIM_DIR, f));
  }

  console.log(`\n✓ Synced ${FILES.length + FIXTURES.length} souborů.`);
  console.log('\nNext steps:');
  console.log('  1. cd ../Projekt-ikaros-FE && npm test -- weatherSimulation');
  console.log('  2. Commit v obou repos současně (same simulation version)');
}

if (require.main === module) {
  main();
}

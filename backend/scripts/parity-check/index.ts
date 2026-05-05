import * as path from 'path';
import { parseCsharpBackend } from './lib/parse-csharp';
import { parseNestjsBackend } from './lib/parse-nestjs';
import { compareAll } from './lib/comparator';
import { writeReports } from './lib/report';

const OLD_BACKEND_DIR = path.resolve('C:/Matrix/Matrix/backend');
const NEW_BACKEND_SRC = path.resolve(__dirname, '../../src');
const JSON_OUTPUT = path.resolve(__dirname, 'output/parity-report.json');
const MD_OUTPUT = path.resolve(__dirname, '../../../docs/checklist-be.md');

async function main(): Promise<void> {
  console.log('🔍 Parsuju starý C# backend...');
  const oldData = parseCsharpBackend(OLD_BACKEND_DIR);
  console.log(`   Endpointy: ${oldData.endpoints.length}, Hub metody: ${oldData.hubMethods.length}, Schémata: ${oldData.schemas.length}, Joby: ${oldData.cronJobs.length}, JWT claims: ${oldData.jwtClaims.length}`);

  console.log('🔍 Parsuju nový NestJS backend...');
  const newData = parseNestjsBackend(NEW_BACKEND_SRC);
  console.log(`   Endpointy: ${newData.endpoints.length}, Gateway zprávy: ${newData.gatewayMessages.length}, Schémata: ${newData.schemas.length}, Cron joby: ${newData.cronJobs.length}, JWT claims: ${newData.jwtClaims.length}`);

  console.log('📊 Porovnávám...');
  const diff = compareAll(oldData, newData);

  const missingCount = diff.endpoints.missing.length + diff.hubMethods.missing.length + diff.schemas.missing.length + diff.cronJobs.missing.length + diff.jwtClaims.missing.length;
  console.log(`   Chybí celkem: ${missingCount} položek`);

  writeReports(
    {
      diff,
      oldEndpointCount: oldData.endpoints.length,
      oldHubMethodCount: oldData.hubMethods.length,
      oldSchemaCount: oldData.schemas.length,
      oldCronJobCount: oldData.cronJobs.length,
      oldJwtClaimCount: oldData.jwtClaims.length,
      generatedAt: new Date().toISOString(),
    },
    JSON_OUTPUT,
    MD_OUTPUT
  );

  if (missingCount === 0) {
    console.log('\n🎉 Feature parity 100% — žádné mezery nenalezeny!');
  } else {
    console.log(`\n⚠️  Nalezeno ${missingCount} potenciálních mezer. Zkontroluj docs/checklist-be.md`);
  }
}

main().catch(err => {
  console.error('Chyba:', err);
  process.exit(1);
});

import * as fs from 'fs';
import * as path from 'path';
import { DiffResult } from './comparator';

interface ReportInput {
  diff: DiffResult;
  oldEndpointCount: number;
  oldHubMethodCount: number;
  oldSchemaCount: number;
  oldCronJobCount: number;
  oldJwtClaimCount: number;
  generatedAt: string;
}

function statusIcon(hasMissing: boolean): string {
  return hasMissing ? '❌' : '✅';
}

export function generateMarkdown(input: ReportInput): string {
  const { diff } = input;
  const lines: string[] = [];

  lines.push('# Checklist BE — Feature Parity');
  lines.push('');
  lines.push(`> Generováno: ${input.generatedAt}  `);
  lines.push('> Starý backend: `C:\\Matrix\\Matrix\\backend`  ');
  lines.push('> Nový backend: `backend/src`  ');
  lines.push('> ✅ pokryto | ❌ chybí | ⚠️ přejmenováno | ➕ jen v novém');
  lines.push('');
  lines.push('---');
  lines.push('');

  // Souhrn
  lines.push('## Souhrn');
  lines.push('');
  lines.push('| Dimenze | Starý | Pokryto | Přejmenováno | Chybí | Navíc | Stav |');
  lines.push('|---------|-------|---------|-------------|-------|-------|------|');

  const ep = diff.endpoints;
  const epOld = input.oldEndpointCount;
  lines.push(`| REST endpointy | ${epOld} | ${ep.covered.length} | ${ep.renamed.length} | ${ep.missing.length} | ${ep.extra.length} | ${statusIcon(ep.missing.length > 0)} |`);

  const hub = diff.hubMethods;
  const hubOld = input.oldHubMethodCount;
  lines.push(`| WebSocket události | ${hubOld} | ${hub.covered.length} | — | ${hub.missing.length} | ${hub.extra.length} | ${statusIcon(hub.missing.length > 0)} |`);

  const sc = diff.schemas;
  const scOld = input.oldSchemaCount;
  lines.push(`| MongoDB schémata | ${scOld} | ${sc.covered.length} | — | ${sc.missing.length} | ${sc.extra.length} | ${statusIcon(sc.missing.length > 0)} |`);

  const cr = diff.cronJobs;
  const crOld = input.oldCronJobCount;
  lines.push(`| Cron joby | ${crOld} | ${cr.covered.length} | — | ${cr.missing.length} | ${cr.extra.length} | ${statusIcon(cr.missing.length > 0)} |`);

  const jwt = diff.jwtClaims;
  const jwtOld = input.oldJwtClaimCount;
  lines.push(`| JWT claims | ${jwtOld} | ${jwt.covered.length} | — | ${jwt.missing.length} | ${jwt.extra.length} | ${statusIcon(jwt.missing.length > 0)} |`);

  lines.push('');
  lines.push('---');
  lines.push('');

  // REST endpointy
  lines.push('## REST endpointy');
  lines.push('');

  if (ep.missing.length > 0) {
    lines.push('### ❌ Chybějící endpointy');
    lines.push('');
    for (const m of ep.missing) {
      lines.push(`- \`${m.old}\``);
    }
    lines.push('');
  }

  if (ep.renamed.length > 0) {
    lines.push('### ⚠️ Pravděpodobně přejmenované');
    lines.push('');
    lines.push('| Starý | Nový |');
    lines.push('|-------|------|');
    for (const r of ep.renamed) {
      lines.push(`| \`${r.old}\` | \`${r.new}\` |`);
    }
    lines.push('');
  }

  if (ep.covered.length > 0) {
    lines.push(`### ✅ Pokryté endpointy (${ep.covered.length})`);
    lines.push('');
    lines.push('<details><summary>Rozbalit</summary>');
    lines.push('');
    lines.push('| Starý | Nový |');
    lines.push('|-------|------|');
    for (const c of ep.covered) {
      lines.push(`| \`${c.old}\` | \`${c.new}\` |`);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  if (ep.extra.length > 0) {
    lines.push('### ➕ Nové endpointy (jen v novém backendu)');
    lines.push('');
    for (const e of ep.extra) {
      lines.push(`- \`${e}\``);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // WebSocket
  lines.push('## WebSocket události');
  lines.push('');

  if (hub.missing.length > 0) {
    lines.push('### ❌ Chybějící');
    lines.push('');
    for (const m of hub.missing) lines.push(`- \`${m}\``);
    lines.push('');
  }
  if (hub.covered.length > 0) {
    lines.push(`### ✅ Pokryté (${hub.covered.length})`);
    lines.push('');
    for (const c of hub.covered) lines.push(`- \`${c}\``);
    lines.push('');
  }
  if (hub.extra.length > 0) {
    lines.push('### ➕ Nové události');
    lines.push('');
    for (const e of hub.extra) lines.push(`- \`${e}\``);
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // Schémata
  lines.push('## MongoDB schémata');
  lines.push('');
  if (sc.missing.length > 0) {
    lines.push('### ❌ Chybějící kolekce');
    lines.push('');
    for (const m of sc.missing) lines.push(`- \`${m}\``);
    lines.push('');
  }
  if (sc.covered.length > 0) {
    lines.push(`### ✅ Pokryté (${sc.covered.length})`);
    lines.push('');
    for (const c of sc.covered) lines.push(`- \`${c}\``);
    lines.push('');
  }
  if (sc.extra.length > 0) {
    lines.push('### ➕ Nové kolekce');
    lines.push('');
    for (const e of sc.extra) lines.push(`- \`${e}\``);
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // Cron joby
  lines.push('## Cron joby / Background joby');
  lines.push('');
  if (cr.missing.length > 0) {
    lines.push('### ❌ Chybějící');
    lines.push('');
    for (const m of cr.missing) lines.push(`- \`${m}\``);
    lines.push('');
  }
  if (cr.covered.length > 0) {
    lines.push(`### ✅ Pokryté (${cr.covered.length})`);
    lines.push('');
    for (const c of cr.covered) lines.push(`- \`${c}\``);
    lines.push('');
  }
  if (cr.extra.length > 0) {
    lines.push('### ➕ Nové joby');
    lines.push('');
    for (const e of cr.extra) lines.push(`- \`${e}\``);
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // JWT claims
  lines.push('## JWT Claims');
  lines.push('');
  if (jwt.missing.length > 0) {
    lines.push('### ❌ Chybějící claims');
    lines.push('');
    for (const m of jwt.missing) lines.push(`- \`${m}\``);
    lines.push('');
  }
  if (jwt.covered.length > 0) {
    lines.push(`### ✅ Pokryté (${jwt.covered.length})`);
    lines.push('');
    for (const c of jwt.covered) lines.push(`- \`${c}\``);
    lines.push('');
  }
  if (jwt.extra.length > 0) {
    lines.push('### ➕ Nové claims');
    lines.push('');
    for (const e of jwt.extra) lines.push(`- \`${e}\``);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## Závěry a rozhodnutí');
  lines.push('');
  lines.push('<!-- Manuálně doplnit po analýze výsledků. Pro každou mezeru rozhodnout: -->');
  lines.push('<!-- - opravit (implementovat chybějící) -->');
  lines.push('<!-- - akceptovat (záměrná změna / redesign) -->');
  lines.push('<!-- - přeskočit (funkce se nepoužívá) -->');
  lines.push('');

  const totalMissing = ep.missing.length + hub.missing.length + sc.missing.length + cr.missing.length + jwt.missing.length;
  lines.push(`**Celkem zjištěných mezer: ${totalMissing}**`);
  lines.push('');

  return lines.join('\n');
}

export function generateJson(input: ReportInput): string {
  return JSON.stringify(
    {
      generatedAt: input.generatedAt,
      summary: {
        endpoints: {
          old: input.oldEndpointCount,
          covered: input.diff.endpoints.covered.length,
          renamed: input.diff.endpoints.renamed.length,
          missing: input.diff.endpoints.missing.length,
          extra: input.diff.endpoints.extra.length,
        },
        hubMethods: {
          old: input.oldHubMethodCount,
          covered: input.diff.hubMethods.covered.length,
          missing: input.diff.hubMethods.missing.length,
          extra: input.diff.hubMethods.extra.length,
        },
        schemas: {
          old: input.oldSchemaCount,
          covered: input.diff.schemas.covered.length,
          missing: input.diff.schemas.missing.length,
          extra: input.diff.schemas.extra.length,
        },
        cronJobs: {
          old: input.oldCronJobCount,
          covered: input.diff.cronJobs.covered.length,
          missing: input.diff.cronJobs.missing.length,
          extra: input.diff.cronJobs.extra.length,
        },
        jwtClaims: {
          old: input.oldJwtClaimCount,
          covered: input.diff.jwtClaims.covered.length,
          missing: input.diff.jwtClaims.missing.length,
          extra: input.diff.jwtClaims.extra.length,
        },
      },
      details: input.diff,
    },
    null,
    2
  );
}

export function writeReports(input: ReportInput, jsonOutputPath: string, markdownOutputPath: string): void {
  fs.mkdirSync(path.dirname(jsonOutputPath), { recursive: true });
  fs.mkdirSync(path.dirname(markdownOutputPath), { recursive: true });
  fs.writeFileSync(jsonOutputPath, generateJson(input), 'utf-8');
  fs.writeFileSync(markdownOutputPath, generateMarkdown(input), 'utf-8');
  console.log(`✅ JSON report: ${jsonOutputPath}`);
  console.log(`✅ Markdown report: ${markdownOutputPath}`);
}

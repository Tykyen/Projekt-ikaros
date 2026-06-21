#!/usr/bin/env node
/**
 * Elevation guard (R-20 / spec-world-admin-elevation).
 *
 * Hlídá, že ve world-scoped modulech NEzůstane přímý platform-admin bypass
 * (`x.role <= UserRole.Admin`, `> UserRole.Admin`, `=== UserRole.Admin/Superadmin`).
 * World bypass MUSÍ jít přes `worldAdminBypass(user, worldId)`, aby respektoval
 * elevaci. Legitimní výjimky (globální/platform akce, ne world-scoped):
 *   - celé platformové moduly (PLATFORM_WHITELIST)
 *   - guard/helper soubory (FILE_WHITELIST)
 *   - jednotlivé řádky označené `// elevation-exempt: <důvod>`
 *
 * Spuštění: `node scripts/check-elevation-bypass.mjs` (exit 1 při nálezu).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src');

// Platformové moduly — admin moc tu NENÍ world-scoped, bypass je v pořádku.
const PLATFORM_WHITELIST = [
  'admin',
  'auth',
  'users',
  'mailer',
  'push',
  'security-tokens',
  'trusted-devices',
  'world-elevations',
  'data-export',
  'friendships',
  'presence',
  'global-chat',
  'ikaros-news',
  'ikaros-articles',
  'ikaros-gallery',
  'ikaros-discussions',
  'ikaros-categories',
  'ikaros-messages',
  'ikaros-events',
];

// Konkrétní soubory mimo moduly (guardy plní elevaci, helper ji definuje).
const FILE_WHITELIST = [
  join('common', 'guards', 'jwt-auth.guard.ts'),
  join('common', 'guards', 'optional-jwt-auth.guard.ts'),
  join('common', 'guards', 'admin.guard.ts'),
  join('common', 'utils', 'world-elevation.ts'),
  join('database', 'seed', 'matrix-world.seed.ts'),
];

// Řádek je bypass kontrola role proti Admin/Superadmin.
const BYPASS_RE =
  /\.role\s*(<=|<|>|>=|===|!==|==)\s*UserRole\.(Admin|Superadmin)|UserRole\.(Admin|Superadmin)\s*(<=|<|>|>=|===|!==|==)\s*\w*\.?role/;
// @Roles(...) decorator je deklarativní RBAC, ne runtime world bypass.
const ROLES_DECORATOR_RE = /@Roles\s*\(/;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (
      p.endsWith('.ts') &&
      !p.endsWith('.spec.ts') &&
      !p.endsWith('.e2e-spec.ts')
    )
      out.push(p);
  }
  return out;
}

function isWhitelisted(relPath) {
  const parts = relPath.split(sep);
  const modIdx = parts.indexOf('modules');
  if (modIdx >= 0 && PLATFORM_WHITELIST.includes(parts[modIdx + 1])) return true;
  return FILE_WHITELIST.some((f) => relPath.endsWith(f));
}

const violations = [];
for (const file of walk(ROOT)) {
  const rel = relative(join(ROOT, '..'), file);
  if (isWhitelisted(rel)) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!BYPASS_RE.test(line)) continue;
    if (ROLES_DECORATOR_RE.test(line)) continue;
    // Elevation-aware check (role<=Admin && isElevated / vedle worldAdminBypass) —
    // legitimní, jen jiná forma helperu (WS DB lookup / kategorie B). Okno ±2 řádky.
    const ctx = lines.slice(Math.max(0, i - 2), i + 3).join('\n');
    if (/isElevated|elevationService|worldAdminBypass/.test(ctx)) continue;
    // marker na témže nebo některém ze 2 předchozích řádků (víceřádkové komentáře)
    if (
      line.includes('elevation-exempt') ||
      (i > 0 && lines[i - 1].includes('elevation-exempt')) ||
      (i > 1 && lines[i - 2].includes('elevation-exempt'))
    )
      continue;
    violations.push(`${rel}:${i + 1}: ${line.trim()}`);
  }
}

if (violations.length) {
  console.error(
    `\n✗ Elevation guard: ${violations.length} přímý world-admin bypass mimo worldAdminBypass.\n` +
      `  Použij worldAdminBypass(user, worldId), nebo (je-li to globální/platform akce)\n` +
      `  označ řádek komentářem "// elevation-exempt: <důvod>".\n`,
  );
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}
console.log('✓ Elevation guard: žádný neošetřený world-admin bypass.');

# Krok 16a — Feature Parity Checker: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vytvořit standalone Node.js skript, který staticky analyzuje starý C# backend a nový NestJS backend, porovná je po 6 dimenzích a vygeneruje `docs/checklist-be.md` se zjištěnými mezerami.

**Architecture:** Skript sestává z C# regex parseru, NestJS ts-morph AST parseru, komparátoru s normalizací cest a generátoru reportů. Běží standalone mimo NestJS kontext přes `ts-node`. Výstup jsou dva soubory: strojový JSON a čitelný Markdown checklist.

**Tech Stack:** Node.js, TypeScript, `ts-morph` (AST pro NestJS), `ts-node`, Jest (unit testy komparátoru)

---

## Mapa souborů

**Vytvořit:**
- `backend/scripts/parity-check/index.ts` — orchestrace, vstupní bod
- `backend/scripts/parity-check/lib/parse-csharp.ts` — regex parser pro C# soubory
- `backend/scripts/parity-check/lib/parse-nestjs.ts` — ts-morph AST parser pro NestJS
- `backend/scripts/parity-check/lib/comparator.ts` — normalizace cest, diff logika
- `backend/scripts/parity-check/lib/report.ts` — generuje JSON + Markdown
- `backend/scripts/parity-check/output/.gitkeep` — placeholder pro output adresář
- `docs/checklist-be.md` — generovaný výstup (commitovat po analýze)

**Modifikovat:**
- `backend/package.json` — přidat `ts-morph` do devDependencies
- `backend/.gitignore` (nebo kořenový) — ignorovat `scripts/parity-check/output/*.json`

---

## Task 1: Setup projektu

**Files:**
- Create: `backend/scripts/parity-check/output/.gitkeep`
- Modify: `backend/package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Nainstalovat ts-morph**

```bash
cd backend
npm install --save-dev ts-morph
```

Očekávaný výstup: `added 1 package` (nebo podobné), bez chyb.

- [ ] **Step 2: Vytvořit output adresář**

```bash
mkdir -p backend/scripts/parity-check/lib
mkdir -p backend/scripts/parity-check/output
touch backend/scripts/parity-check/output/.gitkeep
```

- [ ] **Step 3: Přidat output do .gitignore**

Do kořenového `.gitignore` přidat:

```
backend/scripts/parity-check/output/*.json
```

- [ ] **Step 4: Commit setup**

```bash
git add backend/package.json backend/package-lock.json backend/scripts/parity-check/output/.gitkeep .gitignore
git commit -m "chore(parity-check): setup skript + ts-morph závislost"
```

---

## Task 2: C# parser

**Files:**
- Create: `backend/scripts/parity-check/lib/parse-csharp.ts`

- [ ] **Step 1: Napsat parse-csharp.ts**

```typescript
import * as fs from 'fs';
import * as path from 'path';

export interface OldEndpoint {
  verb: string;
  path: string;
  controller: string;
}

export interface OldHubMethod {
  hub: string;
  name: string;
  direction: 'client-to-server' | 'server-to-client';
}

export interface OldSchema {
  name: string;
  collectionName: string;
}

export interface OldCronJob {
  name: string;
  file: string;
}

export interface OldJwtClaim {
  name: string;
}

export interface OldBackendData {
  endpoints: OldEndpoint[];
  hubMethods: OldHubMethod[];
  schemas: OldSchema[];
  cronJobs: OldCronJob[];
  jwtClaims: OldJwtClaim[];
}

function parseControllerFile(content: string, fileName: string): OldEndpoint[] {
  const endpoints: OldEndpoint[] = [];

  const classMatch = content.match(/public class (\w+)Controller\s*:/);
  if (!classMatch) return endpoints;
  const controllerSlug = classMatch[1];
  const controllerName = controllerSlug.toLowerCase();

  const routeMatch = content.match(/\[Route\("([^"]+)"\)\]/);
  let basePath = routeMatch ? routeMatch[1] : `api/${controllerName}`;
  basePath = basePath
    .replace('[controller]', controllerName)
    .replace('[Controller]', controllerName);
  if (!basePath.startsWith('/')) basePath = '/' + basePath;

  const httpPattern = /\[(HttpGet|HttpPost|HttpPut|HttpDelete|HttpPatch)(?:\("([^"]*)"\))?\]/g;
  let match;
  while ((match = httpPattern.exec(content)) !== null) {
    const verb = match[1].replace('Http', '').toUpperCase();
    const subPath = match[2] ?? '';
    const fullPath = subPath
      ? `${basePath}/${subPath}`.replace(/\/+/g, '/')
      : basePath;
    endpoints.push({ verb, path: fullPath, controller: controllerSlug });
  }

  return endpoints;
}

function parseHubFile(content: string, fileName: string): OldHubMethod[] {
  const methods: OldHubMethod[] = [];
  if (!/ Hub/.test(content) && !content.includes(': Hub')) return methods;

  const hubNameMatch = content.match(/public class (\w+)\s*:/);
  const hubName = hubNameMatch?.[1] ?? path.basename(fileName, '.cs');

  const methodPattern = /public async Task (\w+)\s*\(/g;
  let match;
  while ((match = methodPattern.exec(content)) !== null) {
    methods.push({ hub: hubName, name: match[1], direction: 'client-to-server' });
  }

  const sendPattern = /\.SendAsync\("([^"]+)"/g;
  while ((match = sendPattern.exec(content)) !== null) {
    methods.push({ hub: hubName, name: match[1], direction: 'server-to-client' });
  }

  return methods;
}

function parseModelFiles(backendDir: string): OldSchema[] {
  const schemas: OldSchema[] = [];
  const settingsPath = path.join(backendDir, 'Models', 'MongoDBSettings.cs');

  if (fs.existsSync(settingsPath)) {
    const content = fs.readFileSync(settingsPath, 'utf-8');
    const propPattern = /public string (\w+CollectionName)\s*\{[^}]+\}\s*=\s*"([^"]+)"/g;
    let match;
    while ((match = propPattern.exec(content)) !== null) {
      const name = match[1].replace('CollectionName', '');
      schemas.push({ name, collectionName: match[2] });
    }
  }

  if (schemas.length === 0) {
    const modelsDir = path.join(backendDir, 'Models');
    const skip = new Set(['Dto', 'Settings', 'Status', 'Result', 'Info', 'Model', 'LoginModel', 'WorldPage', 'CustomDiaryBlock', 'DirectoryItemDto']);
    for (const file of fs.readdirSync(modelsDir).filter(f => f.endsWith('.cs'))) {
      const name = file.replace('.cs', '');
      if (!skip.has(name) && !name.endsWith('Dto') && !name.endsWith('Settings')) {
        schemas.push({ name, collectionName: name + 's' });
      }
    }
  }

  return schemas;
}

function parseJwtClaims(content: string): OldJwtClaim[] {
  const seen = new Set<string>();
  const pattern = /new Claim\(\s*([^,)]+)/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    let claimType = match[1].trim().replace(/^["']|["']$/g, '');
    claimType = claimType
      .replace('ClaimTypes.NameIdentifier', 'sub')
      .replace('ClaimTypes.Name', 'unique_name')
      .replace('ClaimTypes.Role', 'role')
      .replace('JwtRegisteredClaimNames.Sub', 'sub')
      .replace(/JwtRegisteredClaimNames\.(\w+)/, (_, n: string) => n.toLowerCase());
    seen.add(claimType);
  }
  return [...seen].map(name => ({ name }));
}

function parseBackgroundJobs(backendDir: string): OldCronJob[] {
  const jobs: OldCronJob[] = [];
  const servicesDir = path.join(backendDir, 'Services');
  if (!fs.existsSync(servicesDir)) return jobs;

  for (const file of fs.readdirSync(servicesDir).filter(f => f.endsWith('.cs'))) {
    const content = fs.readFileSync(path.join(servicesDir, file), 'utf-8');
    if (content.includes('IHostedService') || content.includes('BackgroundService')) {
      jobs.push({ name: file.replace('.cs', ''), file });
    }
  }
  return jobs;
}

export function parseCsharpBackend(backendDir: string): OldBackendData {
  const controllersDir = path.join(backendDir, 'Controllers');
  const hubsDir = path.join(backendDir, 'Hubs');

  const endpoints: OldEndpoint[] = [];
  const hubMethods: OldHubMethod[] = [];

  for (const file of fs.readdirSync(controllersDir).filter(f => f.endsWith('.cs'))) {
    const content = fs.readFileSync(path.join(controllersDir, file), 'utf-8');
    endpoints.push(...parseControllerFile(content, file));
  }

  for (const file of fs.readdirSync(hubsDir).filter(f => f.endsWith('.cs'))) {
    const content = fs.readFileSync(path.join(hubsDir, file), 'utf-8');
    hubMethods.push(...parseHubFile(content, file));
  }

  const schemas = parseModelFiles(backendDir);

  const authPath = path.join(backendDir, 'Controllers', 'AuthController.cs');
  const jwtClaims = fs.existsSync(authPath)
    ? parseJwtClaims(fs.readFileSync(authPath, 'utf-8'))
    : [];

  const cronJobs = parseBackgroundJobs(backendDir);

  return { endpoints, hubMethods, schemas, cronJobs, jwtClaims };
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/scripts/parity-check/lib/parse-csharp.ts
git commit -m "feat(parity-check): C# regex parser — endpointy, huby, schémata, JWT, joby"
```

---

## Task 3: NestJS parser

**Files:**
- Create: `backend/scripts/parity-check/lib/parse-nestjs.ts`

- [ ] **Step 1: Napsat parse-nestjs.ts**

```typescript
import { Project } from 'ts-morph';
import * as path from 'path';

export interface NewEndpoint {
  verb: string;
  path: string;
  controller: string;
}

export interface NewGatewayMessage {
  gateway: string;
  event: string;
  direction: 'client-to-server' | 'server-to-client';
}

export interface NewSchema {
  name: string;
}

export interface NewCronJob {
  schedule: string;
  method: string;
  className: string;
}

export interface NewJwtClaim {
  name: string;
}

export interface NewBackendData {
  endpoints: NewEndpoint[];
  gatewayMessages: NewGatewayMessage[];
  schemas: NewSchema[];
  cronJobs: NewCronJob[];
  jwtClaims: NewJwtClaim[];
}

function getFirstStringArg(decorator: import('ts-morph').Decorator): string {
  const args = decorator.getArguments();
  if (args.length === 0) return '';
  return args[0].getText().replace(/^['"`]|['"`]$/g, '');
}

export function parseNestjsBackend(srcDir: string): NewBackendData {
  const project = new Project({
    compilerOptions: {
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
    skipAddingFilesFromTsConfig: true,
  });

  project.addSourceFilesAtPaths([
    path.join(srcDir, '**/*.controller.ts').replace(/\\/g, '/'),
    path.join(srcDir, '**/*.gateway.ts').replace(/\\/g, '/'),
    path.join(srcDir, '**/*.schema.ts').replace(/\\/g, '/'),
    path.join(srcDir, '**/auth.service.ts').replace(/\\/g, '/'),
    path.join(srcDir, '**/jwt.strategy.ts').replace(/\\/g, '/'),
  ]);

  const endpoints: NewEndpoint[] = [];
  const gatewayMessages: NewGatewayMessage[] = [];
  const schemas: NewSchema[] = [];
  const cronJobs: NewCronJob[] = [];
  const jwtClaims: NewJwtClaim[] = [];
  const HTTP_VERBS = ['Get', 'Post', 'Put', 'Delete', 'Patch'] as const;

  for (const sourceFile of project.getSourceFiles()) {
    for (const cls of sourceFile.getClasses()) {
      // REST kontrolery
      const controllerDec = cls.getDecorator('Controller');
      if (controllerDec) {
        const baseSeg = getFirstStringArg(controllerDec);
        const basePath = baseSeg ? `/api/${baseSeg}` : '/api';
        const controllerName = cls.getName() ?? sourceFile.getBaseName();

        for (const method of cls.getMethods()) {
          for (const verb of HTTP_VERBS) {
            const dec = method.getDecorator(verb);
            if (dec) {
              const subSeg = getFirstStringArg(dec);
              const fullPath = subSeg
                ? `${basePath}/${subSeg}`.replace(/\/+/g, '/')
                : basePath;
              endpoints.push({ verb: verb.toUpperCase(), path: fullPath, controller: controllerName });
            }
          }
        }
      }

      // WebSocket gateway
      const gatewayDec = cls.getDecorator('WebSocketGateway');
      if (gatewayDec) {
        const gatewayName = cls.getName() ?? sourceFile.getBaseName();
        for (const method of cls.getMethods()) {
          const subDec = method.getDecorator('SubscribeMessage');
          if (subDec) {
            gatewayMessages.push({
              gateway: gatewayName,
              event: getFirstStringArg(subDec),
              direction: 'client-to-server',
            });
          }
          // Server→klient eventy z těla metody
          const body = method.getBody()?.getText() ?? '';
          const emitPattern = /\.emit\(['"`]([^'"`]+)['"`]/g;
          let match;
          while ((match = emitPattern.exec(body)) !== null) {
            gatewayMessages.push({
              gateway: gatewayName,
              event: match[1],
              direction: 'server-to-client',
            });
          }
        }
      }

      // MongoDB schémata
      if (cls.getDecorator('Schema')) {
        schemas.push({ name: cls.getName() ?? 'Unknown' });
      }

      // Cron joby
      for (const method of cls.getMethods()) {
        const cronDec = method.getDecorator('Cron');
        if (cronDec) {
          cronJobs.push({
            schedule: getFirstStringArg(cronDec),
            method: method.getName(),
            className: cls.getName() ?? '',
          });
        }
      }
    }

    // JWT claims z auth service / jwt strategy
    const fileName = sourceFile.getBaseName();
    if (fileName.includes('auth') || fileName.includes('jwt')) {
      const text = sourceFile.getText();
      const payloadMatch = text.match(/sign\(\s*\{([^}]+)\}/s);
      if (payloadMatch) {
        const keyPattern = /(\w+)\s*:/g;
        let match;
        const reserved = new Set(['const', 'let', 'var', 'return', 'if', 'else']);
        while ((match = keyPattern.exec(payloadMatch[1])) !== null) {
          if (!reserved.has(match[1])) {
            jwtClaims.push({ name: match[1] });
          }
        }
      }
    }
  }

  // Deduplicate server-to-client events
  const uniqueGateway = gatewayMessages.filter((m, i, arr) =>
    arr.findIndex(x => x.gateway === m.gateway && x.event === m.event && x.direction === m.direction) === i
  );

  return { endpoints, gatewayMessages: uniqueGateway, schemas, cronJobs, jwtClaims };
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/scripts/parity-check/lib/parse-nestjs.ts
git commit -m "feat(parity-check): NestJS ts-morph parser — kontrolery, gateway, schémata, cron, JWT"
```

---

## Task 4: Komparátor (s unit testy)

**Files:**
- Create: `backend/scripts/parity-check/lib/comparator.ts`
- Create: `backend/scripts/parity-check/lib/comparator.test.ts`

- [ ] **Step 1: Napsat failing testy pro normalizeRoutePath**

Soubor `backend/scripts/parity-check/lib/comparator.test.ts`:

```typescript
import { normalizeRoutePath, compareEndpoints } from './comparator';

describe('normalizeRoutePath', () => {
  it('normalizuje C# parametry {id}', () => {
    expect(normalizeRoutePath('/api/worlds/{id}')).toBe('/api/worlds/{param}');
  });

  it('normalizuje NestJS parametry :id', () => {
    expect(normalizeRoutePath('/api/worlds/:id')).toBe('/api/worlds/{param}');
  });

  it('normalizuje NestJS parametry :worldId', () => {
    expect(normalizeRoutePath('/api/worlds/:worldId/pages/:slug')).toBe('/api/worlds/{param}/pages/{param}');
  });

  it('odstraní trailing slash', () => {
    expect(normalizeRoutePath('/api/worlds/')).toBe('/api/worlds');
  });

  it('převede na lowercase', () => {
    expect(normalizeRoutePath('/api/Worlds')).toBe('/api/worlds');
  });

  it('sloučí vícenásobné lomítka', () => {
    expect(normalizeRoutePath('/api//worlds//pages')).toBe('/api/worlds/pages');
  });
});

describe('compareEndpoints', () => {
  it('najde přesnou shodu', () => {
    const result = compareEndpoints(
      [{ verb: 'GET', path: '/api/worlds' }],
      [{ verb: 'GET', path: '/api/worlds' }]
    );
    expect(result.covered).toHaveLength(1);
    expect(result.missing).toHaveLength(0);
  });

  it('označí chybějící endpoint', () => {
    const result = compareEndpoints(
      [{ verb: 'GET', path: '/api/worlds' }],
      []
    );
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].old).toBe('GET /api/worlds');
  });

  it('označí přejmenovaný parametr jako renamed', () => {
    const result = compareEndpoints(
      [{ verb: 'GET', path: '/api/worlds/{id}' }],
      [{ verb: 'GET', path: '/api/worlds/:worldId' }]
    );
    expect(result.renamed).toHaveLength(1);
    expect(result.covered).toHaveLength(0);
  });

  it('označí endpoint jen v novém jako extra', () => {
    const result = compareEndpoints(
      [],
      [{ verb: 'GET', path: '/api/admin/users' }]
    );
    expect(result.extra).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Spustit testy — ověřit fail**

```bash
cd backend
npx jest scripts/parity-check/lib/comparator.test.ts --no-coverage 2>&1 | head -20
```

Očekávaný výstup: `Cannot find module './comparator'` nebo `FAIL`

- [ ] **Step 3: Napsat comparator.ts**

```typescript
import { OldEndpoint, OldHubMethod, OldSchema, OldCronJob, OldJwtClaim } from './parse-csharp';
import { NewEndpoint, NewGatewayMessage, NewSchema, NewCronJob, NewJwtClaim } from './parse-nestjs';

export interface NormalizedEndpoint {
  verb: string;
  path: string;
  original: string;
}

export interface EndpointMatch {
  status: 'covered' | 'missing' | 'renamed';
  old: string;
  new?: string;
  confidence?: 'high';
}

export interface DiffResult {
  endpoints: {
    covered: EndpointMatch[];
    missing: EndpointMatch[];
    renamed: EndpointMatch[];
    extra: string[];
  };
  hubMethods: {
    covered: Array<{ old: string; new: string }>;
    missing: string[];
    extra: string[];
  };
  schemas: {
    covered: Array<{ old: string; new: string }>;
    missing: string[];
    extra: string[];
  };
  cronJobs: {
    covered: string[];
    missing: string[];
    extra: string[];
  };
  jwtClaims: {
    covered: string[];
    missing: string[];
    extra: string[];
  };
}

export function normalizeRoutePath(p: string): string {
  return p
    .replace(/\{[^}]+\}/g, '{param}')
    .replace(/:[a-zA-Z_][a-zA-Z0-9_]*/g, '{param}')
    .replace(/\/+/g, '/')
    .toLowerCase()
    .replace(/\/$/, '');
}

export function normalizeEndpoint(verb: string, rawPath: string): NormalizedEndpoint {
  return {
    verb: verb.toUpperCase(),
    path: normalizeRoutePath(rawPath),
    original: `${verb.toUpperCase()} ${rawPath}`,
  };
}

export function compareEndpoints(
  oldEndpoints: { verb: string; path: string }[],
  newEndpoints: { verb: string; path: string }[]
): DiffResult['endpoints'] {
  const newNorm = newEndpoints.map(e => normalizeEndpoint(e.verb, e.path));
  const oldNorm = oldEndpoints.map(e => normalizeEndpoint(e.verb, e.path));

  const covered: EndpointMatch[] = [];
  const missing: EndpointMatch[] = [];
  const renamed: EndpointMatch[] = [];
  const matchedNewIdx = new Set<number>();

  for (const old of oldNorm) {
    const exactIdx = newNorm.findIndex(
      (n, i) => !matchedNewIdx.has(i) && n.verb === old.verb && n.path === old.path
    );
    if (exactIdx >= 0) {
      covered.push({ status: 'covered', old: old.original, new: newNorm[exactIdx].original });
      matchedNewIdx.add(exactIdx);
      continue;
    }

    const stripParams = (s: string) => s.replace(/\{param\}/g, '').replace(/\/+/g, '/');
    const oldStripped = stripParams(old.path);
    const fuzzyIdx = newNorm.findIndex(
      (n, i) => !matchedNewIdx.has(i) && n.verb === old.verb && stripParams(n.path) === oldStripped
    );
    if (fuzzyIdx >= 0) {
      renamed.push({ status: 'renamed', old: old.original, new: newNorm[fuzzyIdx].original, confidence: 'high' });
      matchedNewIdx.add(fuzzyIdx);
      continue;
    }

    missing.push({ status: 'missing', old: old.original });
  }

  const extra = newNorm.filter((_, i) => !matchedNewIdx.has(i)).map(e => e.original);
  return { covered, missing, renamed, extra };
}

function compareStringLists(oldItems: string[], newItems: string[]): { covered: string[]; missing: string[]; extra: string[] } {
  const newSet = new Set(newItems.map(s => s.toLowerCase()));
  const oldSet = new Set(oldItems.map(s => s.toLowerCase()));
  return {
    covered: oldItems.filter(s => newSet.has(s.toLowerCase())),
    missing: oldItems.filter(s => !newSet.has(s.toLowerCase())),
    extra: newItems.filter(s => !oldSet.has(s.toLowerCase())),
  };
}

export function compareAll(
  old: { endpoints: OldEndpoint[]; hubMethods: OldHubMethod[]; schemas: OldSchema[]; cronJobs: OldCronJob[]; jwtClaims: OldJwtClaim[] },
  next: { endpoints: NewEndpoint[]; gatewayMessages: NewGatewayMessage[]; schemas: NewSchema[]; cronJobs: NewCronJob[]; jwtClaims: NewJwtClaim[] }
): DiffResult {
  const endpoints = compareEndpoints(old.endpoints, next.endpoints);

  // Hub metody: porovnaj client-to-server
  const oldHubC2S = old.hubMethods.filter(m => m.direction === 'client-to-server').map(m => `${m.hub}::${m.name}`);
  const newGatewayC2S = next.gatewayMessages.filter(m => m.direction === 'client-to-server').map(m => `${m.gateway}::${m.event}`);
  const hubC2S = compareStringLists(oldHubC2S, newGatewayC2S);

  const oldHubS2C = old.hubMethods.filter(m => m.direction === 'server-to-client').map(m => m.name);
  const newGatewayS2C = next.gatewayMessages.filter(m => m.direction === 'server-to-client').map(m => m.event);
  const hubS2C = compareStringLists(oldHubS2C, newGatewayS2C);

  const hubMethods = {
    covered: [...hubC2S.covered.map(s => `[client→server] ${s}`), ...hubS2C.covered.map(s => `[server→client] ${s}`)],
    missing: [...hubC2S.missing.map(s => `[client→server] ${s}`), ...hubS2C.missing.map(s => `[server→client] ${s}`)],
    extra: [...hubC2S.extra.map(s => `[client→server] ${s}`), ...hubS2C.extra.map(s => `[server→client] ${s}`)],
  };

  const schemaResult = compareStringLists(
    old.schemas.map(s => s.collectionName),
    next.schemas.map(s => s.name)
  );
  const schemas = {
    covered: schemaResult.covered.map(s => ({ old: s, new: s })),
    missing: schemaResult.missing,
    extra: schemaResult.extra,
  };

  const cronResult = compareStringLists(
    old.cronJobs.map(j => j.name),
    next.cronJobs.map(j => j.className)
  );
  const cronJobs = { covered: cronResult.covered, missing: cronResult.missing, extra: cronResult.extra };

  const claimResult = compareStringLists(
    old.jwtClaims.map(c => c.name),
    next.jwtClaims.map(c => c.name)
  );
  const jwtClaims = { covered: claimResult.covered, missing: claimResult.missing, extra: claimResult.extra };

  return { endpoints, hubMethods, schemas, cronJobs, jwtClaims };
}
```

- [ ] **Step 4: Spustit testy — ověřit pass**

```bash
cd backend
npx jest scripts/parity-check/lib/comparator.test.ts --no-coverage
```

Očekávaný výstup: `Tests: 8 passed, 8 total`

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/parity-check/lib/comparator.ts backend/scripts/parity-check/lib/comparator.test.ts
git commit -m "feat(parity-check): komparátor s normalizací cest + unit testy"
```

---

## Task 5: Report generátor

**Files:**
- Create: `backend/scripts/parity-check/lib/report.ts`

- [ ] **Step 1: Napsat report.ts**

```typescript
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

function coveredPct(covered: number, total: number): string {
  if (total === 0) return '100%';
  return `${Math.round((covered / total) * 100)}%`;
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
    for (const c of sc.covered) lines.push(`- \`${c.old}\``);
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
```

- [ ] **Step 2: Commit**

```bash
git add backend/scripts/parity-check/lib/report.ts
git commit -m "feat(parity-check): report generátor — JSON + Markdown checklist-be.md"
```

---

## Task 6: Orchestrace (index.ts)

**Files:**
- Create: `backend/scripts/parity-check/index.ts`

- [ ] **Step 1: Napsat index.ts**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add backend/scripts/parity-check/index.ts
git commit -m "feat(parity-check): orchestrace — index.ts spojuje všechny parsery"
```

---

## Task 7: Spustit skript a commitnout výstup

- [ ] **Step 1: Spustit parity checker**

```bash
cd backend
npx ts-node --project tsconfig.json scripts/parity-check/index.ts
```

Očekávaný výstup:
```
🔍 Parsuju starý C# backend...
   Endpointy: NNN, Hub metody: NNN, ...
🔍 Parsuju nový NestJS backend...
   Endpointy: NNN, Gateway zprávy: NNN, ...
📊 Porovnávám...
   Chybí celkem: N položek
✅ JSON report: ...output/parity-report.json
✅ Markdown report: ...docs/checklist-be.md
```

Pokud `ts-node` hlásí chybu s `experimentalDecorators`, přidat do `tsconfig.json` v `backend/`:
```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

- [ ] **Step 2: Zkontrolovat vygenerovaný checklist-be.md**

```bash
head -60 ../docs/checklist-be.md
```

Ověřit:
- Soubor existuje a má obsah
- Souhrn tabulka je čitelná
- Sekce chybějících položek jsou přítomny (nebo zpráva "0 mezer")

- [ ] **Step 3: Zkontrolovat parity-report.json**

```bash
cat backend/scripts/parity-check/output/parity-report.json | head -30
```

Ověřit: validní JSON, všechny klíče přítomny (`endpoints`, `hubMethods`, `schemas`, `cronJobs`, `jwtClaims`).

- [ ] **Step 4: Manuálně ověřit seed data (6. dimenze)**

Skript seed data neparuje (formáty C# vs TS jsou strukturálně neparovatelné). Ověřit ručně:

Starý backend — `C:\Matrix\Matrix\backend\Program.cs` — hledat volání jako `SeedDatabase`, `EnsureCreated`, inicializační bloky.

Nový backend — `backend/src/database/seed/` — vypsat soubory:

```bash
ls backend/src/database/seed/
```

Ověřit přítomnost seedů pro:
- Matrix world (world s názvem/slugem "matrix")
- 6 chat skupin (Globální, Evropani, Lumíci, MI6, Komunikace Hráči, Komunikace s PJ)
- 5 šablon stránek per nový svět (pravidla, magicky-system, technologie, faq, videa)

Výsledek zapsat do sekce **Závěry a rozhodnutí** v `docs/checklist-be.md`.

- [ ] **Step 5: Doplnit sekci Závěry v checklist-be.md**

Otevřít `docs/checklist-be.md` a manuálně doplnit sekci **Závěry a rozhodnutí** pro každou nalezenou mezeru — rozhodnutí: opravit / akceptovat / přeskočit.

- [ ] **Step 6: Commitnout finální checklist a skript**

```bash
git add docs/checklist-be.md backend/scripts/parity-check/
git commit -m "feat(parity-check): vygenerován checklist-be.md + finální skript"
```

- [ ] **Step 7: Aktualizovat roadmap**

V `docs/roadmap.md` změnit `Krok 16a — Feature Parity Checklist ⬜` na `✅` a doplnit odkaz na spec a plán.

```bash
git add docs/roadmap.md
git commit -m "docs(roadmap): Krok 16a Feature Parity Checklist ✅"
```

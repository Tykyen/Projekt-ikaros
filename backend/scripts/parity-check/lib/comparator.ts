import {
  OldEndpoint,
  OldHubMethod,
  OldSchema,
  OldCronJob,
  OldJwtClaim,
} from './parse-csharp';
import {
  NewEndpoint,
  NewGatewayMessage,
  NewSchema,
  NewCronJob,
  NewJwtClaim,
} from './parse-nestjs';

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
    covered: string[];
    missing: string[];
    extra: string[];
  };
  schemas: {
    covered: string[];
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

export function normalizeEndpoint(
  verb: string,
  rawPath: string,
): NormalizedEndpoint {
  return {
    verb: verb.toUpperCase(),
    path: normalizeRoutePath(rawPath),
    original: `${verb.toUpperCase()} ${rawPath}`,
  };
}

function stripStaticPath(normalizedPath: string): string {
  return normalizedPath
    .split('/')
    .filter((seg) => seg !== '{param}')
    .join('/');
}

export function compareEndpoints(
  oldEndpoints: { verb: string; path: string }[],
  newEndpoints: { verb: string; path: string }[],
): DiffResult['endpoints'] {
  const newNorm = newEndpoints.map((e) => normalizeEndpoint(e.verb, e.path));
  const oldNorm = oldEndpoints.map((e) => normalizeEndpoint(e.verb, e.path));

  // Uchováme i originální (před normalizací) cesty pro detekci přejmenování
  const newOrigPaths = newEndpoints.map((e) => e.path);
  const oldOrigPaths = oldEndpoints.map((e) => e.path);

  const covered: EndpointMatch[] = [];
  const missing: EndpointMatch[] = [];
  const renamed: EndpointMatch[] = [];
  const matchedNewIdx = new Set<number>();

  for (let oi = 0; oi < oldNorm.length; oi++) {
    const old = oldNorm[oi];

    // Pass 1: Přesná shoda — normalizované verb i path identické
    const exactIdx = newNorm.findIndex(
      (n, i) =>
        !matchedNewIdx.has(i) && n.verb === old.verb && n.path === old.path,
    );
    if (exactIdx >= 0) {
      // Zkontroluj, zda se originální cesty liší (přejmenovaný parametr)
      const origOld = oldOrigPaths[oi];
      const origNew = newOrigPaths[exactIdx];
      const origDiffers =
        normalizeRoutePath(origOld) !== origOld ||
        normalizeRoutePath(origNew) !== origNew
          ? origOld !== origNew
          : false;

      if (
        origDiffers &&
        normalizeRoutePath(origOld) === normalizeRoutePath(origNew)
      ) {
        // Stejná normalizovaná cesta, ale různé původní — renamed
        renamed.push({
          status: 'renamed',
          old: old.original,
          new: newNorm[exactIdx].original,
          confidence: 'high',
        });
      } else {
        covered.push({
          status: 'covered',
          old: old.original,
          new: newNorm[exactIdx].original,
        });
      }
      matchedNewIdx.add(exactIdx);
      continue;
    }

    // Pass 2: Přejmenování — stejný verb, stejná statická struktura, různé normalizované cesty
    const oldStripped = stripStaticPath(old.path);
    const renamedIdx = newNorm.findIndex(
      (n, i) =>
        !matchedNewIdx.has(i) &&
        n.verb === old.verb &&
        stripStaticPath(n.path) === oldStripped &&
        n.path !== old.path,
    );
    if (renamedIdx >= 0) {
      renamed.push({
        status: 'renamed',
        old: old.original,
        new: newNorm[renamedIdx].original,
        confidence: 'high',
      });
      matchedNewIdx.add(renamedIdx);
      continue;
    }

    missing.push({ status: 'missing', old: old.original });
  }

  const extra = newNorm
    .filter((_, i) => !matchedNewIdx.has(i))
    .map((e) => e.original);
  return { covered, missing, renamed, extra };
}

function compareStringLists(
  oldItems: string[],
  newItems: string[],
): { covered: string[]; missing: string[]; extra: string[] } {
  const newSet = new Set(newItems.map((s) => s.toLowerCase()));
  const oldSet = new Set(oldItems.map((s) => s.toLowerCase()));
  return {
    covered: oldItems.filter((s) => newSet.has(s.toLowerCase())),
    missing: oldItems.filter((s) => !newSet.has(s.toLowerCase())),
    extra: newItems.filter((s) => !oldSet.has(s.toLowerCase())),
  };
}

export function compareAll(
  old: {
    endpoints: OldEndpoint[];
    hubMethods: OldHubMethod[];
    schemas: OldSchema[];
    cronJobs: OldCronJob[];
    jwtClaims: OldJwtClaim[];
  },
  next: {
    endpoints: NewEndpoint[];
    gatewayMessages: NewGatewayMessage[];
    schemas: NewSchema[];
    cronJobs: NewCronJob[];
    jwtClaims: NewJwtClaim[];
  },
): DiffResult {
  const endpoints = compareEndpoints(old.endpoints, next.endpoints);

  // Hub metody: porovnaj client-to-server
  const oldHubC2S = old.hubMethods
    .filter((m) => m.direction === 'client-to-server')
    .map((m) => `${m.hub}::${m.name}`);
  const newGatewayC2S = next.gatewayMessages
    .filter((m) => m.direction === 'client-to-server')
    .map((m) => `${m.gateway}::${m.event}`);
  const hubC2S = compareStringLists(oldHubC2S, newGatewayC2S);

  const oldHubS2C = old.hubMethods
    .filter((m) => m.direction === 'server-to-client')
    .map((m) => m.name);
  const newGatewayS2C = next.gatewayMessages
    .filter((m) => m.direction === 'server-to-client')
    .map((m) => m.event);
  const hubS2C = compareStringLists(oldHubS2C, newGatewayS2C);

  const hubMethods = {
    covered: [
      ...hubC2S.covered.map((s) => `[client→server] ${s}`),
      ...hubS2C.covered.map((s) => `[server→client] ${s}`),
    ],
    missing: [
      ...hubC2S.missing.map((s) => `[client→server] ${s}`),
      ...hubS2C.missing.map((s) => `[server→client] ${s}`),
    ],
    extra: [
      ...hubC2S.extra.map((s) => `[client→server] ${s}`),
      ...hubS2C.extra.map((s) => `[server→client] ${s}`),
    ],
  };

  const schemaResult = compareStringLists(
    old.schemas.map((s) => s.collectionName),
    next.schemas.map((s) => s.name),
  );
  const schemas = {
    covered: schemaResult.covered,
    missing: schemaResult.missing,
    extra: schemaResult.extra,
  };

  const cronResult = compareStringLists(
    old.cronJobs.map((j) => j.name),
    next.cronJobs.map((j) => j.className),
  );
  const cronJobs = {
    covered: cronResult.covered,
    missing: cronResult.missing,
    extra: cronResult.extra,
  };

  const claimResult = compareStringLists(
    old.jwtClaims.map((c) => c.name),
    next.jwtClaims.map((c) => c.name),
  );
  const jwtClaims = {
    covered: claimResult.covered,
    missing: claimResult.missing,
    extra: claimResult.extra,
  };

  return { endpoints, hubMethods, schemas, cronJobs, jwtClaims };
}

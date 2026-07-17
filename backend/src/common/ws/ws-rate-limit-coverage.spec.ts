import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * SCALE-RT (styl 26) — **anti-regression guard pokrytí WS rate-limitu.**
 *
 * Proč statická kontrola zdrojáků a ne unit test per handler: rate-limit se
 * neaplikuje centrálně (middleware), ale **ručním `allowWsEvent(...)` na začátku
 * každého handleru**. Takový vzor nikdo nevynucuje → přidáš `@SubscribeMessage`
 * a strop prostě chybí. Přesně to se stalo dvakrát:
 *  - `global-chat.gateway` (10 eventů, 0 stropů) — vč. `ikaros:whisper` a
 *    `chat:reaction:toggle`, které audit označil za nejhorší write eventy;
 *  - `platform-chat.gateway` (3 eventy, 0 stropů) — vznikla po auditu (20.5),
 *    takže o ní report vůbec nevěděl.
 *
 * Test drží invariant „**každý klientský WS event má strop**" bez ohledu na to,
 * kdo a kdy gateway přidá. Selhání NENÍ falešný poplach — buď doplň
 * `allowWsEvent`, nebo (má-li handler strop záměrně postrádat) přidej ho do
 * `EXEMPT` s odůvodněním.
 */

const GATEWAY_ROOT = join(__dirname, '..', '..');

/** Handlery, které strop záměrně nemají. Prázdné = žádná výjimka neexistuje. */
const EXEMPT: Record<string, string> = {};

function findGateways(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      findGateways(full, acc);
    } else if (entry.endsWith('.gateway.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

/** Názvy eventů z `@SubscribeMessage('...')`. */
function subscribedEvents(src: string): string[] {
  return [...src.matchAll(/@SubscribeMessage\(\s*'([^']+)'/g)].map((m) => m[1]);
}

/** Eventy, které mají `allowWsEvent(client, '...')`. */
function guardedEvents(src: string): string[] {
  return [...src.matchAll(/allowWsEvent\(\s*\w+\s*,\s*'([^']+)'/g)].map(
    (m) => m[1],
  );
}

describe('WS rate-limit — pokrytí gateways (SCALE-RT anti-regression)', () => {
  const gateways = findGateways(GATEWAY_ROOT);

  it('najde gateway soubory (pojistka proti tichému projití při špatné cestě)', () => {
    expect(gateways.length).toBeGreaterThan(5);
  });

  it.each(gateways.map((f) => [f.split(/[\\/]/).pop() ?? f, f]))(
    '%s — každý @SubscribeMessage má allowWsEvent',
    (_name, file) => {
      const src = readFileSync(file, 'utf8');
      const events = subscribedEvents(src);
      if (events.length === 0) return; // gateway bez klientských eventů (jen emit)

      const guarded = new Set(guardedEvents(src));
      const missing = events.filter((e) => !guarded.has(e) && !EXEMPT[e]);

      expect(missing).toEqual([]);
    },
  );

  it('guard chytí gateway BEZ stropu (ověření, že test není no-op)', () => {
    const fake = `
      @SubscribeMessage('evil:flood')
      handleEvil(@ConnectedSocket() client: Socket): void {}
    `;
    const events = subscribedEvents(fake);
    const guarded = new Set(guardedEvents(fake));
    expect(events).toEqual(['evil:flood']);
    expect(events.filter((e) => !guarded.has(e))).toEqual(['evil:flood']);
  });
});

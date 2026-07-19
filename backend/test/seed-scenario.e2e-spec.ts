import request from 'supertest';
import { createTestApp, type TestApp } from './helpers/app-factory';
import { authHeader } from './helpers/auth';
import {
  buildCanonicalWorld,
  WorldRole,
  type CanonicalSeed,
} from './helpers/seed-scenario';

/**
 * Seed scenario smoke (9. styl auditu) — JEDEN hlavní automatický průchod
 * aplikací: uživatel → svět → člen → stránka → postava → chat → mapa →
 * oprávnění. Páteř = lineární zápletka (smoke, L2). Mřížka = tvrzení u uzlů
 * (side-effect / integrita / negativní přístup, L3→L4) nad živým `connection`.
 *
 * Plán: docs/seed-scenario-plan/. Registr nálezů: docs/seed-scenario-audit.md.
 * Vyžaduje replica set (`replSet: true`) kvůli transakčním cestám (FA/RC).
 */
describe('Seed scenario smoke (e2e)', () => {
  let testApp: TestApp;
  let seed: CanonicalSeed;
  /** Orphany existující PO bootu, PŘED scénářem (boot seedery — viz SS-01). */
  let baselineOrphans: Set<string>;

  const col = (name: string) => testApp.connection.db!.collection(name);

  /** Klíče osiřelých child dokumentů (worldId ∉ worlds), String-normalizováno. */
  async function worldOrphanKeys(): Promise<string[]> {
    const worldIds = new Set(
      (await col('worlds').find({}).project({ _id: 1 }).toArray()).map((w) =>
        String(w._id),
      ),
    );
    const keys: string[] = [];
    for (const c of ['pages', 'characters', 'worldmemberships', 'mapScenes']) {
      const docs = await col(c)
        .find({ worldId: { $exists: true, $ne: null } })
        .project({ worldId: 1 })
        .toArray();
      for (const d of docs)
        if (!worldIds.has(String(d.worldId)))
          keys.push(`${c}#${String(d._id)}`);
    }
    return keys;
  }

  beforeAll(async () => {
    // TURNSTILE_SECRET='' → captcha DEV bypass (token projde bez síťového callu).
    testApp = await createTestApp({
      replSet: true,
      envOverrides: { TURNSTILE_SECRET: '' },
    });
    // Baseline PŘED scénářem: boot seedery (rulebook→matrix singleton) mohou nechat
    // orphany bez Superadmina — to je SS-01, ne chyba scénáře. Měříme jen deltu.
    baselineOrphans = new Set(await worldOrphanKeys());
    seed = await buildCanonicalWorld(testApp.app, testApp.connection);
  }, 180_000);

  afterAll(async () => {
    await testApp?.close();
  });

  // ── Páteř (L2 smoke) — celý řetěz prošel a entity vznikly ──────────
  describe('páteř (L2 smoke)', () => {
    it('průchod 01→07 vrátil všechna ID', () => {
      for (const [k, v] of Object.entries(seed)) {
        if (k === 'pj' || k === 'hrac') continue;
        expect(`${k}=${String(v)}`).not.toMatch(/=$/); // žádné prázdné ID/slug
      }
    });

    it('02 svět: dokument existuje', async () => {
      expect(
        await col('worlds').findOne({ slug: seed.worldSlug }),
      ).toBeTruthy();
    });

    it('03 člen: hráč je členem s rolí Hrac', async () => {
      const m = await col('worldmemberships').findOne({
        worldId: seed.worldId,
        userId: seed.hrac.userId,
      });
      expect(m).toBeTruthy();
      expect(m!.role).toBe(WorldRole.Hrac);
    });

    it('04 stránka: běžná i persona existují', async () => {
      expect(
        await col('pages').findOne({
          worldId: seed.worldId,
          slug: seed.pageSlug,
        }),
      ).toBeTruthy();
      expect(
        await col('pages').findOne({
          worldId: seed.worldId,
          slug: seed.personaPageSlug,
        }),
      ).toBeTruthy();
    });

    it('05 postava: PC (z persony) i NPC existují', async () => {
      expect(
        await col('characters').findOne({ slug: seed.characterSlug }),
      ).toBeTruthy();
      expect(
        await col('characters').findOne({ worldId: seed.worldId, isNpc: true }),
      ).toBeTruthy();
    });

    it('06 chat: group + channel + message existují', async () => {
      expect(
        await col('chatgroups').findOne({ worldId: seed.worldId }),
      ).toBeTruthy();
      expect(
        await col('chatchannels').findOne({ worldId: seed.worldId }),
      ).toBeTruthy();
      expect(
        await col('chatmessages').findOne({ channelId: seed.chatChannelId }),
      ).toBeTruthy();
    });

    it('07 mapa: scéna existuje', async () => {
      expect(
        await col('mapScenes').findOne({ worldId: seed.worldId }),
      ).toBeTruthy();
    });
  });

  // ── Mřížka: side-effecty (SE) ──────────────────────────────────────
  describe('side-effecty (SE)', () => {
    it('02 svět: seed side-effecty — owner membership + currencies + calendar + settings', async () => {
      const owner = await col('worldmemberships').findOne({
        worldId: seed.worldId,
        userId: seed.pj.userId,
      });
      expect(owner).toBeTruthy();
      expect(owner!.role).toBe(WorldRole.PJ);
      expect(
        await col('world_currencies').findOne({ worldId: seed.worldId }),
      ).toBeTruthy();
      expect(
        await col('world_calendar_configs').findOne({ worldId: seed.worldId }),
      ).toBeTruthy();
      expect(
        await col('worldsettings').findOne({ worldId: seed.worldId }),
      ).toBeTruthy();
    });

    it('03 člen: membership.characterPath ukazuje na přiřazenou postavu', async () => {
      const m = await col('worldmemberships').findOne({
        worldId: seed.worldId,
        userId: seed.hrac.userId,
      });
      expect(m!.characterPath).toBe(seed.characterSlug);
    });

    it('05 postava: PC má přesně 1 deník (CARD kardinalita)', async () => {
      const diaries = await col('character_diaries')
        .find({ characterId: seed.characterId })
        .toArray();
      expect(diaries.length).toBe(1);
    });
  });

  // ── Mřížka: integrita (IN) — žádný orphan na kritických hranách ─────
  describe('integrita (IN)', () => {
    it('SS-01 regrese: boot nezanechal žádný orphan (rulebook seed gated na svět)', () => {
      // Po opravě SS-01 se rulebook stránky neseednou bez matrix světa → baseline 0.
      expect([...baselineOrphans]).toEqual([]);
    });

    it('02/04/05: scénář nepřidal žádný orphan (delta vůči boot baseline)', async () => {
      const now = await worldOrphanKeys();
      const newOrphans = now.filter((k) => !baselineOrphans.has(k));
      expect(newOrphans).toEqual([]);
    });

    it('05: subdoc.characterId míří na existující postavu', async () => {
      const diary = await col('character_diaries').findOne({
        characterId: seed.characterId,
      });
      expect(diary).toBeTruthy();
      expect(
        await col('characters').findOne({ slug: seed.characterSlug }),
      ).toBeTruthy();
    });
  });

  // ── Mřížka: negativní přístup (AC) — hráč nesmí governance/obsah ────
  describe('oprávnění (AC negativní)', () => {
    const srv = () => testApp.app.getHttpServer();

    // 15.11 — hráč nesmí vytvořit ŽIVÝ (approved) obsah ani povyšovat governance:
    // whitelist typ smí jen NAVRHNOUT (pending ke schválení PJ), typ mimo whitelist
    // je 403. Dřív test čekal 403 i na 'Ostatní' — to platilo PŘED 15.11 (návrhy
    // hráčů). Teď ověřujeme obě větve: pending u whitelistu, 403 u ne-whitelistu.
    it('08 hráč smí jen navrhnout whitelist typ (pending), ne vytvořit živý obsah', async () => {
      // whitelist typ ('Ostatní') → 201, ale pending návrh (NE approved/živé).
      const proposal = await request(srv())
        .post(`/api/worlds/${seed.worldId}/pages`)
        .set(authHeader(seed.hrac.accessToken))
        .send({ slug: 'navrh-hrace', type: 'Ostatní', title: 'Návrh hráče' });
      expect(proposal.status).toBe(201);
      const pageDoc = await col('pages').findOne({ slug: 'navrh-hrace' });
      expect(pageDoc?.pageStatus).toBe('pending');

      // typ MIMO whitelist ('Postava hráče' má vlastní tok „Chci hrát" 15.10) → 403.
      const forbidden = await request(srv())
        .post(`/api/worlds/${seed.worldId}/pages`)
        .set(authHeader(seed.hrac.accessToken))
        .send({ slug: 'hack', type: 'Postava hráče', title: 'Hack' });
      expect([401, 403, 404]).toContain(forbidden.status);
    });

    it('08 hráč nesmí smazat svět (403)', async () => {
      const res = await request(srv())
        .delete(`/api/worlds/${seed.worldId}`)
        .set(authHeader(seed.hrac.accessToken));
      expect([401, 403, 404]).toContain(res.status);
    });

    it('01 chráněný endpoint bez tokenu → 401', async () => {
      const res = await request(srv()).get(`/api/worlds/${seed.worldId}/pages`);
      expect([401, 403]).toContain(res.status);
    });
  });
});

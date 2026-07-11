import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, type TestApp } from '../helpers/app-factory';
import { registerUser, authHeader, type AuthSession } from '../helpers/auth';
import {
  buildCanonicalWorld,
  type CanonicalSeed,
} from '../helpers/seed-scenario';

/**
 * Skill `pentest` T1 — REST IDOR napříč světy/uživateli (styl 2/12/13).
 *
 * Katalogem přiznaná NEJVĚTŠÍ mezera (attack-catalog.md §Mezery, bod 1):
 * „Plošný `GET/PATCH /worlds/:A/<entita>/:idZ_B → 403` nepokryt — máme jen WS/room
 * IDOR (PT-2a/4a/4b)." Tenhle soubor to zavírá reálným výstřelem.
 *
 * Persona útočníka = **cizí hráč**: registrovaný uživatel, který NENÍ členem
 * cílového (privátního) světa A a je PJ svého vlastního světa B. To je nejostřejší
 * scénář — má platný JWT, jen ne membership v A.
 *
 * Sekundárně: **elevation** — člen světa A s nízkou rolí (Hrac) čte data, co má
 * vidět jen štáb (PJ / PomocnyPJ).
 *
 * Každý útok = negativní pin (útočník BLOKOVÁN) + tam, kde to dává smysl, pozitivní
 * kontrola (PJ/vlastník data VIDÍ) — aby zelený pin nebyl falešný (endpoint,
 * který 403ne kohokoli kvůli rozbití, není obrana). Když by IDOR PROŠEL, test
 * zčervená a nahlásí konkrétní leaklý endpoint.
 *
 * Svět A staví kanonický seed builder (privátní, `accessMode:'private'`):
 *   PJ (victim) + Hrac (member) + stránka + PC persona (vlastník Hrac) + NPC +
 *   chat + scéna. Vyžaduje replica set (transakční cesty seedu).
 */
describe('PT-IDOR · REST cross-world/cross-user IDOR', () => {
  let testApp: TestApp;
  let app: INestApplication;
  let seed: CanonicalSeed; // svět A (victim)
  let attacker: AuthSession; // cizí hráč — NEČLEN světa A
  let worldBId: string; // vlastní svět útočníka (je PJ jinde)
  let pageId: string; // reálné ID stránky světa A (mutace cíl)
  let npcSlug: string; // slug NPC světa A (staff-only subdoc)
  let bestieId: string; // world-scoped bestie světa A

  const srv = () => app.getHttpServer();
  const A = () => authHeader(attacker.accessToken); // cizí hráč
  const PJ = () => authHeader(seed.pj.accessToken); // vlastník světa A
  const HRAC = () => authHeader(seed.hrac.accessToken); // nízká role v A
  const col = (n: string) => testApp.connection.db!.collection(n);

  /** Obrana drží = útok nesmí vydat 2xx (401 auth / 403 gate / 404 no-leak). */
  const expectBlocked = (res: request.Response): void => {
    expect(res.status).not.toBe(200);
    expect(res.status).not.toBe(201);
    expect([401, 403, 404]).toContain(res.status);
  };

  beforeAll(async () => {
    testApp = await createTestApp({
      replSet: true,
      envOverrides: { TURNSTILE_SECRET: '' },
    });
    app = testApp.app;

    // Svět A + PJ + Hrac member + data (privátní).
    seed = await buildCanonicalWorld(app, testApp.connection);

    // Cizí hráč (attacker) — registrovaný, bez membershipu v A.
    attacker = await registerUser(app, {
      username: 'idor-attacker',
      email: 'idor-attacker@test.io',
      password: 'Password123!',
    });

    // Attacker si založí VLASTNÍ svět B → je reálný PJ jinde. Ověřuje, že role
    // PJ ve světě B nedává žádná práva ve světě A (cross-world izolace).
    const wb = await request(srv())
      .post('/api/worlds')
      .set(A())
      .send({
        name: 'Svět B (attacker)',
        slug: `idor-world-b-${Date.now()}`,
        genre: 'fantasy',
        system: 'dnd5e',
        accessMode: 'private',
        description: 'Attackerův vlastní svět',
      });
    if (wb.status !== 201)
      throw new Error(
        `world B create: ${wb.status} ${JSON.stringify(wb.body)}`,
      );
    worldBId = String(wb.body.id ?? wb.body._id);

    // Reálné ID/slug cílů ze světa A (tvrdý IDOR — existující entita, ne fake id).
    const pageDoc = await col('pages').findOne({
      worldId: seed.worldId,
      slug: seed.pageSlug,
    });
    pageId = String(pageDoc?._id ?? '');
    const npcDoc = await col('characters').findOne({
      worldId: seed.worldId,
      isNpc: true,
    });
    npcSlug = String(npcDoc?.slug ?? '');

    // PJ světa A vytvoří world-scoped bestii (cíl IDOR bestiáře). systemId bez
    // BE schématu → soft-mode přeskočí validaci statů (nezáleží na obsahu).
    const b = await request(srv()).post('/api/bestiae').set(PJ()).send({
      scope: 'world',
      worldId: seed.worldId,
      systemId: 'pentest-idor-sys',
      name: 'Tajný zlobr světa A',
      systemStats: {},
    });
    if (b.status !== 201 && b.status !== 200)
      throw new Error(`bestie create: ${b.status} ${JSON.stringify(b.body)}`);
    bestieId = String(b.body.id ?? b.body._id);

    // Sanity — cíle existují.
    expect(pageId).toMatch(/^[a-f0-9]{24}$/i);
    expect(npcSlug.length).toBeGreaterThan(0);
    expect(bestieId).toMatch(/^[a-f0-9]{24}$/i);
  }, 180_000);

  afterAll(async () => {
    await testApp?.close();
  });

  // ══════════════════════════════════════════════════════════════════════
  // ÚTOK 1 — Stránky (pages): cizí hráč čte privátní obsah světa A
  // ══════════════════════════════════════════════════════════════════════
  describe('Útok 1 · pages (cizí hráč → privátní svět A)', () => {
    it('GET /worlds/:A/pages/:slug — plný obsah stránky NESMÍ unikat', async () => {
      const res = await request(srv())
        .get(`/api/worlds/${seed.worldId}/pages/${seed.pageSlug}`)
        .set(A());
      expectBlocked(res);
      // Žádný page payload (title/content) v těle.
      expect(res.body?.content).toBeUndefined();
      expect(res.body?.title).toBeUndefined();
    });

    it('GET /worlds/:A/pages (listing) — NESMÍ vrátit seznam stránek', async () => {
      const res = await request(srv())
        .get(`/api/worlds/${seed.worldId}/pages`)
        .set(A());
      expectBlocked(res);
      expect(Array.isArray(res.body)).toBe(false);
    });

    it('GET /worlds/:A/pages/directory — adresář stránek NESMÍ unikat', async () => {
      const res = await request(srv())
        .get(`/api/worlds/${seed.worldId}/pages/directory`)
        .set(A());
      expectBlocked(res);
    });

    it('GET /worlds/:A/pages/meta/:slug — meta/existence NESMÍ unikat', async () => {
      const res = await request(srv())
        .get(`/api/worlds/${seed.worldId}/pages/meta/${seed.pageSlug}`)
        .set(A());
      expectBlocked(res);
    });

    it('GET /worlds/:A/pages/data (random) — náhodné stránky NESMÍ unikat', async () => {
      const res = await request(srv())
        .get(`/api/worlds/${seed.worldId}/pages/data?number=50`)
        .set(A());
      expectBlocked(res);
    });

    it('GET /worlds/:A/pages/dataSlugs — slugy stránek NESMÍ unikat', async () => {
      const res = await request(srv())
        .get(`/api/worlds/${seed.worldId}/pages/dataSlugs`)
        .set(A());
      expectBlocked(res);
    });

    // Pozitivní kontrola: PJ tutéž stránku VIDÍ → gate je reálná, ne rozbitý endpoint.
    it('[pin-validity] PJ světa A stránku VIDÍ (200 + content)', async () => {
      const res = await request(srv())
        .get(`/api/worlds/${seed.worldId}/pages/${seed.pageSlug}`)
        .set(PJ());
      expect(res.status).toBe(200);
      expect(res.body?.slug).toBe(seed.pageSlug);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // ÚTOK 2 — Postavy (characters): roster + detail + deník cizí postavy
  // ══════════════════════════════════════════════════════════════════════
  describe('Útok 2 · characters (cizí hráč → privátní svět A)', () => {
    it('GET /worlds/:A/characters — roster NESMÍ unikat', async () => {
      const res = await request(srv())
        .get(`/api/worlds/${seed.worldId}/characters`)
        .set(A());
      expectBlocked(res);
      expect(Array.isArray(res.body)).toBe(false);
    });

    it('GET /worlds/:A/characters/players — PC roster (userId↔postava) NESMÍ unikat', async () => {
      const res = await request(srv())
        .get(`/api/worlds/${seed.worldId}/characters/players`)
        .set(A());
      expectBlocked(res);
    });

    it('GET /worlds/:A/characters/:slug — detail cizí postavy NESMÍ unikat', async () => {
      const res = await request(srv())
        .get(`/api/worlds/${seed.worldId}/characters/${seed.characterSlug}`)
        .set(A());
      expectBlocked(res);
      // Deník / customData / extraBlocks nikdy.
      expect(res.body?.diaryData).toBeUndefined();
      expect(res.body?.extraBlocks).toBeUndefined();
    });

    it('GET /worlds/:A/characters/by-user/:victimUserId — enumerace postav hráče NESMÍ projít', async () => {
      const res = await request(srv())
        .get(
          `/api/worlds/${seed.worldId}/characters/by-user/${seed.hrac.userId}`,
        )
        .set(A());
      expectBlocked(res);
    });

    it('[pin-validity] PJ světa A roster VIDÍ (200 + pole postav)', async () => {
      const res = await request(srv())
        .get(`/api/worlds/${seed.worldId}/characters`)
        .set(PJ());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // ÚTOK 3 — Subdokumenty (finance/inventory/deník/poznámky) + mapy + bestie
  // ══════════════════════════════════════════════════════════════════════
  describe('Útok 3 · subdocs / maps / bestiae (cizí hráč → svět A)', () => {
    it('GET /worlds/:A/characters/:slug/finance — finance cizí PC NESMÍ unikat', async () => {
      const res = await request(srv())
        .get(
          `/api/worlds/${seed.worldId}/characters/${seed.characterSlug}/finance`,
        )
        .set(A());
      expectBlocked(res);
      expect(res.body?.balance).toBeUndefined();
    });

    it('GET /worlds/:A/characters/:slug/inventory — inventář cizí PC NESMÍ unikat', async () => {
      const res = await request(srv())
        .get(
          `/api/worlds/${seed.worldId}/characters/${seed.characterSlug}/inventory`,
        )
        .set(A());
      expectBlocked(res);
    });

    it('GET /worlds/:A/characters/:slug/diary — deník cizí PC NESMÍ unikat', async () => {
      const res = await request(srv())
        .get(
          `/api/worlds/${seed.worldId}/characters/${seed.characterSlug}/diary`,
        )
        .set(A());
      expectBlocked(res);
    });

    it('GET /worlds/:A/characters/:slug/notes — poznámky cizí PC NESMÍ unikat', async () => {
      const res = await request(srv())
        .get(
          `/api/worlds/${seed.worldId}/characters/${seed.characterSlug}/notes`,
        )
        .set(A());
      expectBlocked(res);
    });

    it('GET /maps?worldId=:A — orchestrator dump scén (HP/fog/pozice) NESMÍ unikat', async () => {
      const res = await request(srv())
        .get(`/api/maps?worldId=${seed.worldId}`)
        .set(A());
      expectBlocked(res);
      expect(Array.isArray(res.body)).toBe(false);
    });

    it('GET /maps/:sceneId — detail scény světa A NESMÍ unikat', async () => {
      const res = await request(srv())
        .get(`/api/maps/${seed.sceneId}`)
        .set(A());
      expectBlocked(res);
      expect(res.body?.tokens).toBeUndefined();
    });

    it('GET /maps/:sceneId/operations — per-scene log světa A NESMÍ unikat', async () => {
      const res = await request(srv())
        .get(`/api/maps/${seed.sceneId}/operations?since=0`)
        .set(A());
      expectBlocked(res);
      expect(res.body?.operations).toBeUndefined();
    });

    it('GET /bestiae?worldId=:A — world bestiář NESMÍ unikat', async () => {
      const res = await request(srv())
        .get(`/api/bestiae?systemId=pentest-idor-sys&worldId=${seed.worldId}`)
        .set(A());
      expectBlocked(res);
    });

    it('GET /bestiae/:id — konkrétní world-scoped bestie světa A NESMÍ unikat', async () => {
      const res = await request(srv()).get(`/api/bestiae/${bestieId}`).set(A());
      expectBlocked(res);
      expect(res.body?.systemStats).toBeUndefined();
    });

    // Pozitivní kontroly — vlastník/štáb data VIDÍ (pin validita).
    it('[pin-validity] vlastník (Hrac) VIDÍ finance své PC (200)', async () => {
      const res = await request(srv())
        .get(
          `/api/worlds/${seed.worldId}/characters/${seed.characterSlug}/finance`,
        )
        .set(HRAC());
      expect(res.status).toBe(200);
    });

    it('[pin-validity] PJ světa A VIDÍ world bestii (200)', async () => {
      const res = await request(srv())
        .get(`/api/bestiae/${bestieId}`)
        .set(PJ());
      expect(res.status).toBe(200);
      expect(res.body?.name).toBe('Tajný zlobr světa A');
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // ÚTOK 4 — Mutace: cizí hráč zapisuje do entit světa A → 403 + žádný zápis
  // ══════════════════════════════════════════════════════════════════════
  describe('Útok 4 · mutace (cizí hráč PATCH/PUT/POST/DELETE → svět A)', () => {
    it('PATCH /worlds/:A/pages/:id — přepis stránky NESMÍ projít', async () => {
      const res = await request(srv())
        .patch(`/api/worlds/${seed.worldId}/pages/${pageId}`)
        .set(A())
        .send({ title: 'HACKED-BY-ATTACKER' });
      expectBlocked(res);
    });

    it('PATCH /worlds/:A/characters/:slug — přepis postavy NESMÍ projít', async () => {
      const res = await request(srv())
        .patch(`/api/worlds/${seed.worldId}/characters/${seed.characterSlug}`)
        .set(A())
        .send({ name: 'HACKED-BY-ATTACKER' });
      expectBlocked(res);
    });

    it('PATCH /worlds/:A/characters/:slug/finance — přepis financí NESMÍ projít', async () => {
      const res = await request(srv())
        .patch(
          `/api/worlds/${seed.worldId}/characters/${seed.characterSlug}/finance`,
        )
        .set(A())
        .send({ balance: 999999 });
      expectBlocked(res);
    });

    it('DELETE /worlds/:A/characters/:slug — smazání postavy NESMÍ projít', async () => {
      const res = await request(srv())
        .delete(`/api/worlds/${seed.worldId}/characters/${seed.characterSlug}`)
        .set(A());
      expectBlocked(res);
    });

    it('PUT /maps/:sceneId (worldId=B v těle) — cross-world přepis scény NESMÍ projít', async () => {
      // FIX-16 regrese: attacker pošle SVŮJ worldId v těle, ale service autorizuje
      // proti scene.worldId (=A) z DB → 403, ne zápis.
      const res = await request(srv())
        .put(`/api/maps/${seed.sceneId}`)
        .set(A())
        .send({ name: 'HACKED-SCENE', worldId: worldBId });
      expectBlocked(res);
    });

    it('POST /maps/:sceneId/operations — cizí operace na scénu A se NESMÍ aplikovat', async () => {
      const res = await request(srv())
        .post(`/api/maps/${seed.sceneId}/operations`)
        .set(A())
        .send({ type: 'fog.reveal', hexes: [{ q: 0, r: 0 }] });
      // Malformed op → 400 (validace před auth), jinak 403/404. Klíč: NEaplikováno.
      expect([400, 403, 404]).toContain(res.status);
      expect(res.body?.recordId).toBeUndefined();
    });

    it('PATCH /bestiae/:id — přepis world bestie NESMÍ projít', async () => {
      const res = await request(srv())
        .patch(`/api/bestiae/${bestieId}`)
        .set(A())
        .send({ name: 'HACKED-BESTIE' });
      expectBlocked(res);
    });

    // Verifikace: PO všech mutacích data světa A beze změny (žádný tichý zápis).
    it('[pin-validity] data světa A zůstala nezměněná (PJ re-read)', async () => {
      const page = await request(srv())
        .get(`/api/worlds/${seed.worldId}/pages/${seed.pageSlug}`)
        .set(PJ());
      expect(page.status).toBe(200);
      expect(page.body?.title).not.toBe('HACKED-BY-ATTACKER');

      const char = await request(srv())
        .get(`/api/worlds/${seed.worldId}/characters/${seed.characterSlug}`)
        .set(PJ());
      expect(char.status).toBe(200);
      expect(char.body?.name).not.toBe('HACKED-BY-ATTACKER');

      const bestie = await request(srv())
        .get(`/api/bestiae/${bestieId}`)
        .set(PJ());
      expect(bestie.status).toBe(200);
      expect(bestie.body?.name).toBe('Tajný zlobr světa A');
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // ÚTOK 5 — Elevation: člen A s nízkou rolí (Hrac) čte štáb-only data
  // ══════════════════════════════════════════════════════════════════════
  describe('Útok 5 · elevation (Hrac člen A → PJ/štáb-only data)', () => {
    it('Hrac GET /maps?worldId=:A — orchestrator scén je štáb-only (PomocnyPJ+)', async () => {
      const res = await request(srv())
        .get(`/api/maps?worldId=${seed.worldId}`)
        .set(HRAC());
      expectBlocked(res);
    });

    it('Hrac GET NPC finance — subdoc NPC je štáb-only', async () => {
      const res = await request(srv())
        .get(`/api/worlds/${seed.worldId}/characters/${npcSlug}/finance`)
        .set(HRAC());
      expectBlocked(res);
    });

    it('Hrac GET /worlds/:A/pages/dataSlugs — slugy jsou PomocnyPJ+ only', async () => {
      const res = await request(srv())
        .get(`/api/worlds/${seed.worldId}/pages/dataSlugs`)
        .set(HRAC());
      expectBlocked(res);
    });

    it('Hrac GET detail NPC — public view bez deníku (roster OK, deník ne)', async () => {
      const res = await request(srv())
        .get(`/api/worlds/${seed.worldId}/characters/${npcSlug}`)
        .set(HRAC());
      // Roster je členům viditelný (200), ale deník/customData redigované.
      expect(res.status).toBe(200);
      expect(res.body?.diaryData).toBeUndefined();
      expect(res.body?.extraBlocks).toBeUndefined();
    });

    it('[pin-validity] PJ světa A orchestrator scén VIDÍ (200 + pole scén)', async () => {
      const res = await request(srv())
        .get(`/api/maps?worldId=${seed.worldId}`)
        .set(PJ());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});

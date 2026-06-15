import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, type TestApp } from '../helpers/app-factory';
import { authHeader } from '../helpers/auth';
import {
  buildCanonicalWorld,
  type CanonicalSeed,
} from '../helpers/seed-scenario';
import { Gate, withGate } from './race-barrier';

/**
 * Oblast 04 — Mazání entity při souběžné operaci (race-condition audit, 15. styl).
 * Plán: docs/race-condition-plan/04-mazani.md. Registr: docs/race-condition-audit.md.
 *
 * Přesah s cascade-delete + db-integrity audity (orphan = stejná třída) — tady
 * se ověřuje RACE úhel: vznikne dítě, zatímco rodič mizí.
 */
describe('Race: mazání při otevřeném detailu (e2e)', () => {
  let testApp: TestApp;
  let app: INestApplication;
  let seed: CanonicalSeed;

  let messageRepo: any;

  let inventoryRepo: any;

  const srv = () => app.getHttpServer();
  const tok = () => authHeader(seed.pj.accessToken);
  const col = (n: string) => testApp.connection.db!.collection(n);

  async function createChannel(name: string): Promise<string> {
    const res = await request(srv())
      .post(
        `/api/worlds/${seed.worldId}/chat/groups/${seed.chatGroupId}/channels`,
      )
      .set(tok())
      .send({ name });
    return String(res.body.id ?? res.body._id);
  }

  async function createPc(slug: string): Promise<{ slug: string; id: string }> {
    const res = await request(srv())
      .post(`/api/worlds/${seed.worldId}/characters`)
      .set(tok())
      .send({ slug, name: slug, isNpc: false });
    if (res.status !== 201 && res.status !== 200)
      throw new Error(`createPc ${res.status}: ${JSON.stringify(res.body)}`);
    return { slug, id: String(res.body.id ?? res.body._id) };
  }

  beforeAll(async () => {
    testApp = await createTestApp({
      replSet: true,
      envOverrides: { TURNSTILE_SECRET: '' },
    });
    app = testApp.app;
    seed = await buildCanonicalWorld(app, testApp.connection);
    messageRepo = app.get('IChatMessageRepository');
    inventoryRepo = app.get('ICharacterInventoryRepository');
  }, 180_000);

  afterAll(async () => {
    await testApp?.close();
  });

  // ── ✅ RC-D3 (OPRAVENO): zpráva do kanálu mazaného mezi read↔save → žádný orphan ──
  // Fix v chat.service.sendMessage: po save re-ověří kanál; když zmizel,
  // soft-smaže zprávu + 404 → žádná živá osiřelá zpráva.
  it('✅ RC-D3: smazání kanálu mezi read↔save zprávy → žádná živá osiřelá zpráva', async () => {
    const channelId = await createChannel('del-msg-race');

    const gate = new Gate();
    const restore = withGate(messageRepo, 'save', gate);
    try {
      const sendP = request(srv())
        .post(`/api/worlds/${seed.worldId}/chat/channels/${channelId}/messages`)
        .set(tok())
        .send({ content: 'orphan?' })
        .then((r) => r);
      await gate.reached; // sendMessage přečetl kanál (existuje), čeká na save
      await request(srv())
        .delete(`/api/worlds/${seed.worldId}/chat/channels/${channelId}`)
        .set(tok()); // smaž kanál mezitím
      gate.open();
      await sendP; // zpráva se uloží do (mezitím) smazaného kanálu
    } finally {
      restore();
    }

    const channelGone =
      (await col('chatchannels').countDocuments({ _id: toId(channelId) })) ===
      0;
    const liveOrphans = await col('chatmessages').countDocuments({
      channelId,
      isDeleted: { $ne: true },
    });
    // Pokud kanál zmizel, nesmí zůstat živá zpráva s jeho channelId (orphan).
    if (channelGone) expect(liveOrphans).toBe(0);
  }, 60_000);

  // ── 🐛 RC-D1: postava smazána během lazy-create subdocu → žádný orphan subdoc ──
  // getInventory lazy-creates, když subdoc chybí. Když se postava smaže v okně
  // mezi „subdoc chybí" a `create`, `character.deleted` cascade
  // (`deleteByCharacterId`) proběhne DŘÍV, než lazy-create zapíše → orphan
  // inventory s characterId mrtvé postavy. Fix: po create re-ověř existenci
  // rodiče a orphan smaž (vzor RC-D3).
  it('🐛 RC-D1: smazání postavy mezi „chybí subdoc"↔create → žádný osiřelý inventář', async () => {
    const pc = await createPc(`pc-orphan-${Date.now().toString(36)}`);
    // Simuluj legacy/chybějící subdoc: smaž inventář postavy → další GET ho lazy-creatne.
    await col('character_inventories').deleteMany({ characterId: pc.id });

    const gate = new Gate();
    // Gate na inventoryRepo.create (lazy-create write). Drží PŘED zápisem subdocu.
    const restore = withGate(inventoryRepo, 'create', gate);
    try {
      const getP = request(srv())
        .get(`/api/worlds/${seed.worldId}/characters/${pc.slug}/inventory`)
        .set(tok())
        .then((r) => r);
      await gate.reached; // getInventory zjistil chybějící subdoc, čeká na create
      await request(srv())
        .delete(`/api/worlds/${seed.worldId}/characters/${pc.slug}`)
        .set(tok()); // smaž postavu mezitím (cascade deleteByCharacterId nic netrefí)
      gate.open();
      await getP; // lazy-create teď zapíše subdoc do (mezitím) smazané postavy
    } finally {
      restore();
    }

    const charGone =
      (await col('characters').countDocuments({ _id: toId(pc.id) })) === 0;
    const orphanSubdocs = await col('character_inventories').countDocuments({
      characterId: pc.id,
    });
    // Invariant: pokud postava zmizela, nesmí zůstat její osiřelý inventář.
    if (charGone) expect(orphanSubdocs).toBe(0);
  }, 60_000);

  // ── RC-D4: double-delete kanálu → konzistentní (žádné 500), kanál pryč ───────
  it('RC-D4: 2 souběžná smazání téhož kanálu → žádné 500, kanál odstraněn', async () => {
    const channelId = await createChannel('double-del');
    const del = () =>
      request(srv())
        .delete(`/api/worlds/${seed.worldId}/chat/channels/${channelId}`)
        .set(tok());
    const results = await Promise.allSettled([del(), del()]);
    const statuses = results.map((r) =>
      r.status === 'fulfilled' ? r.value.status : 0,
    );
    expect(statuses.filter((s) => s >= 500)).toHaveLength(0);
    expect(
      await col('chatchannels').countDocuments({ _id: toId(channelId) }),
    ).toBe(0);
  }, 60_000);

  // mongo _id je ObjectId; channelId je string → cast pro count.

  function toId(id: string): any {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Types } = require('mongoose');
    return Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : id;
  }
});

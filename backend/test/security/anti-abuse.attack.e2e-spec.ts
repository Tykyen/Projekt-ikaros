import request from 'supertest';
import { createTestApp, type TestApp } from '../helpers/app-factory';
import { registerUser, authHeader } from '../helpers/auth';
import { clearAllCollections } from '../helpers/db';
import { buildCanonicalWorld } from '../helpers/seed-scenario';

/**
 * Skill `pentest` T1 — ANTI-ABUSE útoky (styl 34). Katalog PT-34a/b/c.
 *
 * Audit právě zavřel 3 abuse díry; tenhle spec je test-first regresní pojistka,
 * že obrany DRŽÍ. Zelený test = fix funguje. Kdyby některý zČERVENAL, obrana
 * povolila a díra je zpět otevřená.
 *
 * Persona útočníka = běžný hráč (WorldRole.Hrac) nebo cizí přihlášený uživatel;
 * útok „za jiného" = 2. registrovaný user. Cíl = lokální e2e harness, NE prod.
 *
 * Plný `AppModule` (jako seed-scenario.e2e-spec.ts) — útoky sahají napříč
 * moduly (chat + characters + moderation + worlds), selektivní import by musel
 * ručně poskládat celý závislostní graf (moderation → pending-actions +
 * ikaros-messages + mailer; chat → upload/worlds/users). `replSet: true` kvůli
 * transakčním kaskádám (character.created subdoc fan-out).
 */
describe('PT-34 · Anti-abuse (fan-out DoS / quota / report spam)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({
      replSet: true,
      envOverrides: { TURNSTILE_SECRET: '' }, // captcha DEV bypass
    });
  });
  afterAll(async () => testApp.close());
  beforeEach(async () => clearAllCollections(testApp.connection));

  const srv = () => testApp.app.getHttpServer();

  // ───────────────────────────────────────────────────────────────────────────
  // PT-34a — @all/@here fan-out gate (chat.service.ts ~1357)
  //
  // Útok: běžný hráč (role Hrac < PomocnyPJ) pošle do kanálu zprávu s `@all`.
  // Kdyby BE expandoval `@all` na VŠECHNY příjemce kanálu, jeden request jednoho
  // hráče by rozeslal notifikaci celé jeskyni (až 50 hráčů) → notifikační DoS.
  // Obrana: broadcastMentions jen pro canManageChat (PomocnyPJ+). Hráčovo `@all`
  // zůstane jen text — `mentions` NESMÍ expandovat.
  // ───────────────────────────────────────────────────────────────────────────
  it('PT-34a: hráčovo @all NEexpanduje mentions (fan-out DoS zavřen)', async () => {
    const seed = await buildCanonicalWorld(testApp.app, testApp.connection, {
      suffix: 'abu34a',
    });

    // Hráč (WorldRole.Hrac) je člen a má přístup do default 'all' kanálu → smí psát.
    const res = await request(srv())
      .post(
        `/api/worlds/${seed.worldId}/chat/channels/${seed.chatChannelId}/messages`,
      )
      .set(authHeader(seed.hrac.accessToken))
      .send({ content: '@all pozor na tohle!' });

    expect([200, 201]).toContain(res.status);
    const mentions = (res.body?.mentions ?? []) as string[];

    // KLÍČOVÁ OBRANA: žádná expanze fan-outu.
    expect(Array.isArray(mentions)).toBe(true);
    expect(mentions).not.toContain(seed.pj.userId); // PJ (a nikdo jiný) nebyl hromadně zmíněn
    expect(mentions).toHaveLength(0); // `@all` zůstal jen textem
  });

  // Validita pinu (PT-34a): STEJNÝ payload `@all`, ale odesílatel = PJ
  // (canManageChat=true) → mentions SE expandují na příjemce (hráče). Kontrolní
  // vzorek dokazuje, že gate rozlišuje podle role: bez obrany by hráčův výsledek
  // vypadal jako tenhle (neprázdný) — tudíž PT-34a by bez obrany zČERVENAL.
  it('PT-34a-pin: PJ @all EXPANDUJE mentions (gate je podmíněný rolí, ne blanket)', async () => {
    const seed = await buildCanonicalWorld(testApp.app, testApp.connection, {
      suffix: 'abu34apin',
    });

    const res = await request(srv())
      .post(
        `/api/worlds/${seed.worldId}/chat/channels/${seed.chatChannelId}/messages`,
      )
      .set(authHeader(seed.pj.accessToken))
      .send({ content: '@all svolávám všechny' });

    expect([200, 201]).toContain(res.status);
    const mentions = (res.body?.mentions ?? []) as string[];
    // PJ smí broadcast → hráč (příjemce kanálu) je ve fan-outu.
    expect(mentions).toContain(seed.hrac.userId);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PT-34b — character quota cap (characters.service.ts:297, MAX=5000)
  //
  // Útok: flood create postav z jednoho světa (každý create spustí kaskádu
  // subdoců calendar/finance/inventory) → zaplavení DB. Obrana: tvrdý strop
  // 5000, kód WORLD_CHARACTER_QUOTA (403).
  //
  // 5000 reálně nevytváříme — nasypeme 4999 lehkých docs přímo do kolekce
  // (countByWorld = countDocuments({worldId})), pak přes REST:
  //   create #1 (count 4999 < 5000) → 201  (obrana není blanket blok)
  //   create #2 (count 5000 >= 5000) → 403 WORLD_CHARACTER_QUOTA (hranice drží)
  // Tím je hranice pinnutá z obou stran = zároveň validita pinu pro PT-34b.
  // ───────────────────────────────────────────────────────────────────────────
  it('PT-34b: strop postav/svět drží (4999→201, 5000→403 WORLD_CHARACTER_QUOTA)', async () => {
    const owner = await registerUser(testApp.app, {
      username: 'pj-abu34b',
      email: 'pj-abu34b@test.io',
      password: 'Password123!',
    });

    const wRes = await request(srv())
      .post('/api/worlds')
      .set(authHeader(owner.accessToken))
      .send({
        name: 'Quota World',
        slug: `quota-abu34b-${Date.now()}`,
        genre: 'fantasy',
        system: 'dnd5e',
        accessMode: 'private',
        description: 'Test',
      });
    expect([200, 201]).toContain(wRes.status);
    const worldId = (wRes.body?.id ?? wRes.body?._id) as string;

    // Nasyp 4999 lehkých character docs přímo do kolekce (obchází kaskádu i
    // mongoose validaci; countByWorld je čistý countDocuments({worldId})).
    const filler = Array.from({ length: 4999 }, (_, i) => ({
      worldId,
      slug: `filler-${i}`,
      name: `Filler ${i}`,
      isNpc: true,
    }));
    await testApp.connection.db!.collection('characters').insertMany(filler);

    // create #1 — count 4999 < 5000 → projde (obrana není plošná).
    const ok = await request(srv())
      .post(`/api/worlds/${worldId}/characters`)
      .set(authHeader(owner.accessToken))
      .send({ slug: 'boundary-ok', name: 'Boundary OK', isNpc: true });
    expect([200, 201]).toContain(ok.status);

    // create #2 — count je teď 5000 → strop musí sklapnout.
    const blocked = await request(srv())
      .post(`/api/worlds/${worldId}/characters`)
      .set(authHeader(owner.accessToken))
      .send({ slug: 'boundary-over', name: 'Over Limit', isNpc: true });
    expect(blocked.status).toBe(403);
    expect(blocked.body?.error?.code).toBe('WORLD_CHARACTER_QUOTA');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PT-34c — report dedup (moderation.service.ts:121)
  //
  // Útok: 1 oznamovatel spamuje týž cíl otevřenými reporty → zahlcení moderační
  // fronty + notifikací + e-mailů. Obrana: existsPendingByReporterAndTarget →
  // 2. pending report téhož reportera na týž cíl = 409 REPORT_DUPLICATE.
  // ───────────────────────────────────────────────────────────────────────────
  it('PT-34c: 2. pending report na týž cíl = 409 REPORT_DUPLICATE (spam zavřen)', async () => {
    const reporter = await registerUser(testApp.app, {
      username: 'reporter-abu34c',
      email: 'reporter-abu34c@test.io',
      password: 'Password123!',
    });

    const reportBody = {
      targetType: 'chat_message',
      targetId: 'target-msg-123',
      targetSnapshot: 'urážlivý obsah',
      targetAuthorName: 'Zloduch',
      category: 'harassment',
      reason: 'Toto je obtěžování.',
      goodFaith: true,
      notifyMe: false,
      anonymous: false,
    };

    // 1. report → přijat.
    const first = await request(srv())
      .post('/api/moderation/reports')
      .set(authHeader(reporter.accessToken))
      .send(reportBody);
    expect([200, 201]).toContain(first.status);

    // 2. report TÉHOŽ reportera na TÝŽ cíl → Conflict, ne duplikát ve frontě.
    const dup = await request(srv())
      .post('/api/moderation/reports')
      .set(authHeader(reporter.accessToken))
      .send(reportBody);
    expect(dup.status).toBe(409);
    expect(dup.body?.error?.code).toBe('REPORT_DUPLICATE');
  });

  // Validita pinu (PT-34c): STEJNÝ reporter, JINÝ cíl → 201. Dedup je vázán na
  // (reporter × cíl), ne blanket blok 2. reportu. Dokazuje, že 409 výše spouští
  // konkrétně duplicitní cíl — bez obrany by i tenhle byl „jen další report".
  it('PT-34c-pin: týž reporter na JINÝ cíl = 201 (dedup je target-scoped)', async () => {
    const reporter = await registerUser(testApp.app, {
      username: 'reporter-abu34cpin',
      email: 'reporter-abu34cpin@test.io',
      password: 'Password123!',
    });
    const base = {
      targetType: 'chat_message',
      targetSnapshot: 'obsah',
      targetAuthorName: 'Zloduch',
      category: 'spam',
      reason: 'spam zpráva',
      goodFaith: true,
      notifyMe: false,
      anonymous: false,
    };

    const first = await request(srv())
      .post('/api/moderation/reports')
      .set(authHeader(reporter.accessToken))
      .send({ ...base, targetId: 'target-A' });
    expect([200, 201]).toContain(first.status);

    const other = await request(srv())
      .post('/api/moderation/reports')
      .set(authHeader(reporter.accessToken))
      .send({ ...base, targetId: 'target-B' });
    expect([200, 201]).toContain(other.status);
  });
});

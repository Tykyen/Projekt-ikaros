import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, type TestApp } from '../helpers/app-factory';
import { authHeader } from '../helpers/auth';
import {
  buildCanonicalWorld,
  type CanonicalSeed,
} from '../helpers/seed-scenario';
import { Barrier, Gate, withBarrier, withGate } from './race-barrier';
import { CharacterAccountsService } from '../../src/modules/character-subdocs/character-accounts.service';
import { CharacterAccountRepository } from '../../src/modules/character-subdocs/repositories/character-account.repository';
import { CampaignPurchaseService } from '../../src/modules/campaign/services/campaign-purchase.service';
import { UserRole } from '../../src/modules/users/interfaces/user.interface';

/**
 * Oblast 01 — Paralelní ekonomika (race-condition audit, 15. styl).
 * Plán: docs/race-condition-plan/01-ekonomika.md. Registr: docs/race-condition-audit.md.
 *
 * Peníze jsou nejtvrdší cíl: lost update / TOCTOU = záporný zůstatek nebo
 * duplikované peníze. Čteno přímo v kódu (vysoká jistota), tady se to DOKAZUJE
 * deterministickým interleavem (Barrier / Gate), ne probabilistickým Promise.all.
 *
 * Konvence: ✅ test = invariant DRŽÍ (zelená dobře). 🐛 test pojmenovaný
 * `RC-E*` SELHÁVÁ dokud bug žije — to je POTVRZENÍ nálezu (červená = bug).
 */
describe('Race: ekonomika (e2e)', () => {
  let testApp: TestApp;
  let app: INestApplication;
  let seed: CanonicalSeed;
  let accountsService: CharacterAccountsService;
  let accountsRepo: CharacterAccountRepository;
  let purchaseService: CampaignPurchaseService;

  let purchaseRepo: any;

  const srv = () => app.getHttpServer();
  const tok = () => authHeader(seed.pj.accessToken);

  // ── ekonomické helpery (routy ověřené v controllerech) ──────────────
  async function makeAccount(
    ownerSlug: string,
    currency = 'zl',
    fund = 0,
  ): Promise<string> {
    const res = await request(srv())
      .post(`/api/worlds/${seed.worldId}/characters/${ownerSlug}/accounts`)
      .set(tok())
      .send({
        label: `acc-${Math.random().toString(36).slice(2, 7)}`,
        currency,
      });
    if (res.status !== 201 && res.status !== 200)
      throw new Error(`makeAccount ${res.status}: ${JSON.stringify(res.body)}`);
    const id = String(res.body.id ?? res.body._id);
    if (fund > 0) await adjust(id, fund, 'seed-fund');
    return id;
  }

  async function adjust(accountId: string, amount: number, reason: string) {
    return request(srv())
      .post(`/api/worlds/${seed.worldId}/accounts/${accountId}/adjust`)
      .set(tok())
      .send({ amount, reason });
  }

  async function getAccount(accountId: string) {
    const res = await request(srv())
      .get(`/api/worlds/${seed.worldId}/accounts/${accountId}`)
      .set(tok());
    return res.body as {
      balance: number;
      transactions: { delta: number; description: string }[];
    };
  }

  async function createShopItem(price: number): Promise<string> {
    // currencyCode úmyslně vynechán → spadne na měnu účtu → bez kurzové konverze.
    const res = await request(srv())
      .post(`/api/campaign/shopitems?worldId=${seed.worldId}`)
      .set(tok())
      .send({ name: `item-${Math.random().toString(36).slice(2, 7)}`, price });
    if (res.status !== 201 && res.status !== 200)
      throw new Error(
        `createShopItem ${res.status}: ${JSON.stringify(res.body)}`,
      );
    return String(res.body.id ?? res.body._id);
  }

  function purchase(itemId: string, accountId: string) {
    return request(srv())
      .post(
        `/api/campaign/shopitems/${itemId}/purchase?worldId=${seed.worldId}`,
      )
      .set(tok())
      .send({ characterId: seed.characterId, accountId });
  }

  function refund(purchaseId: string) {
    return request(srv())
      .post(
        `/api/campaign/purchases/${purchaseId}/refund?worldId=${seed.worldId}`,
      )
      .set(tok());
  }

  beforeAll(async () => {
    testApp = await createTestApp({
      replSet: true,
      envOverrides: { TURNSTILE_SECRET: '' },
    });
    app = testApp.app;
    seed = await buildCanonicalWorld(app, testApp.connection);
    accountsService = app.get(CharacterAccountsService);
    accountsRepo = app.get(CharacterAccountRepository);
    purchaseService = app.get(CampaignPurchaseService);
    purchaseRepo = app.get('ICampaignPurchaseRepository');
  }, 180_000);

  afterAll(async () => {
    await testApp?.close();
  });

  // ── ✅ Baseline: atomický $inc drží (harness nesmí dávat falešně červenou) ──
  it('✅ baseline: 10 souběžných adjust(+1) → balance == 10 (atomický $inc)', async () => {
    const acc = await makeAccount(seed.characterSlug, 'zl', 0);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => adjust(acc, 1, 'inc')),
    );
    expect(results.every((r) => r.status === 201 || r.status === 200)).toBe(
      true,
    );
    expect((await getAccount(acc)).balance).toBe(10);
  }, 60_000);

  // ── ✅ Conservation: transfer pod souběhem zachová celkové peníze ──────────
  it('✅ conservation: 20 souběžných transferů A→B zachová součet (withTransaction)', async () => {
    const a = await makeAccount(seed.characterSlug, 'zl', 1000);
    const b = await makeAccount(seed.characterSlug, 'zl', 0);
    await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        request(srv())
          .post(`/api/worlds/${seed.worldId}/accounts/${a}/transfer`)
          .set(tok())
          .send({ toAccountId: b, amount: 10, description: 't' }),
      ),
    );
    const total = (await getAccount(a)).balance + (await getAccount(b)).balance;
    expect(total).toBe(1000);
  }, 60_000);

  // ── 🐛 RC-E1: TOCTOU overdraft — balance check je read-then-act, $inc bez floor ──
  it('🐛 RC-E1: 2 souběžné nákupy nad rámec zůstatku → záporný balance (overdraft)', async () => {
    const acc = await makeAccount(seed.characterSlug, 'zl', 100);
    const item = await createShopItem(80); // 2× 80 = 160 > 100

    // Bariéra na adjust (odečet z účtu): oba nákupy projdou balance check
    // (oba čtou 100) a sejdou se na odečtu → oba $inc -80 → -60.
    const barrier = new Barrier(2);
    const restore = withBarrier(accountsService, 'adjust', barrier);
    try {
      await Promise.allSettled([purchase(item, acc), purchase(item, acc)]);
    } finally {
      restore();
    }

    const balance = (await getAccount(acc)).balance;
    // Invariant: účet nesmí jít do mínusu přes kontrolu krytí.
    expect(balance).toBeGreaterThanOrEqual(0);
  }, 60_000);

  // ── 🐛 RC-E2: double-refund — status!=='active' check není atomický ──────────
  it('🐛 RC-E2: 2 souběžná storna téhož nákupu → peníze vráceny 2× (double-refund)', async () => {
    const acc = await makeAccount(seed.characterSlug, 'zl', 100);
    const item = await createShopItem(30);
    const buyRes = await purchase(item, acc);
    expect([200, 201]).toContain(buyRes.status); // balance 70
    const purchaseId = String(
      buyRes.body.purchase.id ?? buyRes.body.purchase._id,
    );

    const barrier = new Barrier(2);
    const restore = withBarrier(accountsService, 'adjust', barrier);
    let results: PromiseSettledResult<request.Response>[] = [];
    try {
      results = await Promise.allSettled([
        refund(purchaseId),
        refund(purchaseId),
      ]);
    } finally {
      restore();
    }

    const ok = results.filter(
      (r) => r.status === 'fulfilled' && [200, 201].includes(r.value.status),
    ).length;
    const balance = (await getAccount(acc)).balance;
    // Invarianty: smí projít jen JEDNO storno; zůstatek max původních 100.
    expect(ok).toBe(1);
    expect(balance).toBeLessThanOrEqual(100);
  }, 60_000);

  // ── 🐛 RC-E3: undoLast lost update — read tx array → $set slice (full replace) ──
  it('🐛 RC-E3: adjust mezi read↔write undoLast → vklad zmizí (lost update)', async () => {
    const acc = await makeAccount(seed.characterSlug, 'zl', 0);
    await adjust(acc, 100, 'tx1');
    await adjust(acc, 50, 'tx2'); // balance 150, [tx1, tx2]

    // Gate na repo.update (undoLast zapisuje přes update): drží undo PO readu,
    // PŘED writem. Mezitím proběhne atomický adjust(+25). Pak undo přepíše
    // celé pole transakcí ze zastaralého snapshotu → tx3 (+25) zmizí.
    const gate = new Gate();
    const restore = withGate(accountsRepo, 'update', gate);
    try {
      // `.then()` dispatch — supertest Test je líný; bez něj se request neodešle
      // a gate.reached by nikdy nefajrnul (deadlock/timeout).
      const undoP = request(srv())
        .post(`/api/worlds/${seed.worldId}/accounts/${acc}/undo`)
        .set(tok())
        .then((r) => r);
      await gate.reached; // undo udělal read, čeká na write
      await adjust(acc, 25, 'mid'); // atomický append → balance 175, [tx1,tx2,tx3]
      gate.open();
      await undoP; // write ze zastaralého snapshotu
    } finally {
      restore();
    }

    const acct = await getAccount(acc);
    // Invariant (fix-agnostický): 3 appendy (tx1,tx2,mid) − 1 undo = 2 transakce.
    // Bug smaže DVĚ (zůstane jen [tx1], len 1) protože undo přepíše celé pole ze
    // zastaralého snapshotu. Validní serializace (i po fixu) nechá přesně 2.
    expect(acct.transactions).toHaveLength(2);
    // Konzistence: zůstatek = součet delt zbylých transakcí.
    const sum = acct.transactions.reduce((s, t) => s + t.delta, 0);
    expect(acct.balance).toBe(sum);
  }, 60_000);

  // ── 🐛 RC-E4: inventář full-array $set lost-update — 2 nákupy, položka zmizí ──
  // Před fixem: addToInventory čte celé `sections`, mutuje JS kopii a uloží přes
  // updateInventory (full `$set`). Dva souběžné nákupy přečtou stejné sekce, oba
  // appendnou položku → druhý `$set` přepíše první → položka prvního zmizí.
  it('🐛 RC-E4: 2 souběžné nákupy do téhož inventáře → obě položky zůstanou', async () => {
    const acc = await makeAccount(seed.characterSlug, 'zl', 1000);
    const itemA = await createShopItem(10);
    const itemB = await createShopItem(10);

    // Vyčisti inventář postavy na čistý start (předchozí testy mohly přidat položky).
    const invCol = testApp.connection.db!.collection('character_inventories');
    await invCol.updateOne(
      { characterId: seed.characterId },
      { $set: { sections: [] } },
    );

    // Bariéra na repo.appendItemToSection (atomická append cesta po fixu) — oba
    // nákupy se sejdou v zápisové cestě inventáře a vynutí interleave read↔write.
    // (Red-proof legacy `$set` cesty se ověřoval dočasným přepnutím service na
    // full-array update + bariérou na repo.update — viz audit registr.)
    const barrier = new Barrier(2);

    const inventoryRepo = app.get('ICharacterInventoryRepository');
    const restore = withBarrier(inventoryRepo, 'appendItemToSection', barrier);
    try {
      await Promise.allSettled([purchase(itemA, acc), purchase(itemB, acc)]);
    } finally {
      restore();
    }

    const inv = await invCol.findOne({ characterId: seed.characterId });
    const sections = (inv?.sections ?? []) as { items?: unknown[] }[];
    const totalItems = sections.reduce(
      (sum, sec) => sum + (sec.items?.length ?? 0),
      0,
    );
    // Invariant: 2 nákupy = 2 položky ve výbavě (ani jedna se neztratí).
    expect(totalItems).toBe(2);
  }, 60_000);

  // ── 🐛 RC-E5: nákup bez atomicity — pád kroku (3) purchase log → peníze pryč ──
  // Nákup = 3 kroky (1) append do inventáře (2) odečet z účtu (3) purchase log.
  // Bez transakce: když selže krok (3), peníze JSOU odečteny + položka přidána,
  // ale chybí purchase záznam → nelze stornovat → nevratný částečný stav.
  // Invariant (peníze se neztratí): po SELHÁNÍ nákupu buď
  //   (a) balance zůstal nedotčený (atomický rollback), NEBO
  //   (b) existuje purchase log, kterým lze peníze vrátit.
  // Bug poruší obojí: balance klesne, purchase log žádný.
  it('🐛 RC-E5: pád purchase logu (krok 3) → peníze se nesmí ztratit (atomicita)', async () => {
    const acc = await makeAccount(seed.characterSlug, 'zl', 1000);
    const item = await createShopItem(100);
    const before = (await getAccount(acc)).balance; // 1000

    // Vynuť selhání kroku (3): purchase log create hodí JEDNOU.
    const spy = jest
      .spyOn(purchaseRepo, 'create')
      .mockRejectedValueOnce(new Error('DB write failed (purchase log)'));

    let threw = false;
    try {
      // Volání přímo přes service (mimo HTTP) — chceme přesně 1 nákup, ne souběh.
      await purchaseService.purchase(
        seed.worldId,
        item,
        { id: seed.pj.userId, role: UserRole.Hrac, username: 'pj' },
        { characterId: seed.characterId, accountId: acc },
      );
    } catch {
      threw = true;
    } finally {
      spy.mockRestore();
    }
    expect(threw).toBe(true); // nákup musí selhat (krok 3 padl)

    const after = (await getAccount(acc)).balance;
    // Spočti, kolik purchase logů pro tuto postavu+účet existuje (storno-cesta).
    const purchaseCount = await testApp.connection
      .db!.collection('campaignPurchases')
      .countDocuments({ accountId: acc, characterId: seed.characterId });

    // Peníze se neztratily POUZE pokud: balance nedotčen, NEBO existuje log na storno.
    const moneyPreserved = after === before || purchaseCount > 0;
    expect(moneyPreserved).toBe(true);

    // Atomicita: na replSet `withTransaction` celou trojici rollbackne →
    // balance se NESMÍ odečíst a purchase log NESMÍ zůstat (žádný částečný stav).
    expect(after).toBe(before);
    expect(purchaseCount).toBe(0);
  }, 60_000);
});

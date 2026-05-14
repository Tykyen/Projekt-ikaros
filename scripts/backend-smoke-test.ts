/* eslint-disable no-console */
/**
 * Backend smoke test — projde základní flow přes HTTP API a vypíše PASS/FAIL.
 *
 * Spuštění:
 *   cd backend && npm run smoke:be
 *   nebo: BASE_URL=http://host:port npx ts-node scripts/backend-smoke-test.ts
 *
 * Pravidla:
 *   - Veškerá testovací data mají prefix `TEST_VERIFICATION_` (titles)
 *     resp. `test-verification-` (slugs/emails — kvůli lowercase požadavkům).
 *   - Skript po sobě uklízí pouze data s tímto prefixem.
 *   - Pokud něco nelze otestovat, hlásí se to jako FAIL/TODO; nikdy se nepředstírá úspěch.
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const API = `${BASE_URL.replace(/\/+$/, '')}/api`;
const RUN_ID = Date.now().toString(36);
const TITLE_PREFIX = 'TEST_VERIFICATION_';
const SLUG_PREFIX = 'test-verification-';
const EMAIL_PREFIX = 'test_verification_';

type Status = 'PASS' | 'FAIL' | 'TODO';

interface StepResult {
  name: string;
  status: Status;
  detail?: string;
}

class Reporter {
  private results: StepResult[] = [];

  record(name: string, status: Status, detail?: string): void {
    this.results.push({ name, status, detail });
    const tag =
      status === 'PASS' ? '\x1b[32mPASS\x1b[0m'
      : status === 'FAIL' ? '\x1b[31mFAIL\x1b[0m'
      : '\x1b[33mTODO\x1b[0m';
    const detailStr = detail ? ` — ${detail}` : '';
    console.log(`  ${tag}  ${name}${detailStr}`);
  }

  pass(name: string, detail?: string): void {
    this.record(name, 'PASS', detail);
  }
  fail(name: string, detail?: string): void {
    this.record(name, 'FAIL', detail);
  }
  todo(name: string, detail?: string): void {
    this.record(name, 'TODO', detail);
  }

  summary(): { allPassed: boolean; counts: Record<Status, number> } {
    const counts: Record<Status, number> = { PASS: 0, FAIL: 0, TODO: 0 };
    for (const r of this.results) counts[r.status]++;
    const allPassed = counts.FAIL === 0 && counts.TODO === 0;
    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log(`  PASS: ${counts.PASS}   FAIL: ${counts.FAIL}   TODO: ${counts.TODO}`);
    console.log('═══════════════════════════════════════════════');
    if (counts.FAIL || counts.TODO) {
      console.log('Problémy:');
      for (const r of this.results) {
        if (r.status !== 'PASS') {
          console.log(`  [${r.status}] ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
        }
      }
    }
    return { allPassed, counts };
  }
}

interface ApiResponse<T> {
  ok: boolean;
  status: number;
  body: { data?: T; error?: { code: string; message: string } } | unknown;
}

class Client {
  token?: string;

  async req<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    opts: { auth?: boolean } = { auth: true },
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (opts.auth !== false && this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    let res: Response;
    try {
      res = await fetch(`${API}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      return {
        ok: false,
        status: 0,
        body: { error: { code: 'NETWORK', message: String(err) } },
      };
    }

    let parsed: unknown;
    const text = await res.text();
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text };
    }
    return { ok: res.ok, status: res.status, body: parsed };
  }

  data<T>(r: ApiResponse<T>): T | undefined {
    const b = r.body as { data?: T };
    return b?.data;
  }

  errMsg(r: ApiResponse<unknown>): string {
    const b = r.body as { error?: { message?: string }; message?: string };
    return b?.error?.message ?? b?.message ?? `HTTP ${r.status}`;
  }
}

interface AuthResp {
  accessToken: string;
  refreshToken: string;
  user: { id: string; username: string; email: string; role: number };
}

async function run(): Promise<void> {
  console.log(`Backend smoke test — ${BASE_URL} — run=${RUN_ID}`);
  console.log('───────────────────────────────────────────────');

  const r = new Reporter();
  const adminClient = new Client();
  const userClient = new Client();

  // ─── 1) Health ──────────────────────────────────────────────────────
  const health = await adminClient.req<{
    status: string;
    checks: Record<string, { ok: boolean; detail?: string; missing?: string[] }>;
  }>('GET', '/health', undefined, { auth: false });

  if (health.status === 0) {
    r.fail('GET /api/health', `backend nedostupný na ${BASE_URL}`);
    r.summary();
    process.exit(1);
  }
  if (!health.ok) {
    r.fail('GET /api/health', `HTTP ${health.status}`);
  } else {
    const data = adminClient.data(health);
    if (data?.status === 'ok') {
      r.pass('GET /api/health', `status=ok, mongo=${data.checks.mongo.detail}`);
    } else {
      r.fail(
        'GET /api/health',
        `status=${data?.status} — ${Object.entries(data?.checks ?? {})
          .filter(([, v]) => !v.ok)
          .map(([k, v]) => `${k}: ${v.detail ?? 'nok'}`)
          .join('; ')}`,
      );
    }
    // Sub-checks reportujeme zvlášť pro přehlednost
    for (const [name, check] of Object.entries(data?.checks ?? {})) {
      if (check.ok) {
        r.pass(`health.${name}`, check.detail);
      } else {
        r.fail(`health.${name}`, check.detail);
      }
    }
  }

  // ─── 2) Register + login (admin = PJ vlastníka světa) ───────────────
  const adminEmail = `${EMAIL_PREFIX}admin_${RUN_ID}@test.local`;
  const adminUsername = `tv_admin_${RUN_ID}`.slice(0, 32);
  const adminPassword = 'TestVerify12345';

  const registerAdmin = await adminClient.req<AuthResp>(
    'POST',
    '/auth/register',
    { email: adminEmail, username: adminUsername, password: adminPassword },
    { auth: false },
  );
  if (registerAdmin.status === 201 || registerAdmin.status === 200) {
    const data = adminClient.data(registerAdmin);
    adminClient.token = data?.accessToken;
    r.pass('POST /auth/register (admin user)', `userId=${data?.user.id}`);
  } else {
    r.fail('POST /auth/register (admin user)', adminClient.errMsg(registerAdmin));
    r.summary();
    process.exit(1);
  }

  const loginAdmin = await adminClient.req<AuthResp>(
    'POST',
    '/auth/login',
    { email: adminEmail, password: adminPassword },
    { auth: false },
  );
  let adminUserId: string | undefined;
  if (loginAdmin.ok) {
    const data = adminClient.data(loginAdmin);
    adminClient.token = data?.accessToken;
    adminUserId = data?.user.id;
    r.pass('POST /auth/login', `JWT získán`);
  } else {
    r.fail('POST /auth/login', adminClient.errMsg(loginAdmin));
    r.summary();
    process.exit(1);
  }

  // ─── 3) Druhý uživatel (Hrac, pro role-gating testy) ────────────────
  const userEmail = `${EMAIL_PREFIX}hrac_${RUN_ID}@test.local`;
  const userUsername = `tv_hrac_${RUN_ID}`.slice(0, 32);
  const registerUser = await userClient.req<AuthResp>(
    'POST',
    '/auth/register',
    { email: userEmail, username: userUsername, password: adminPassword },
    { auth: false },
  );
  if (registerUser.ok || registerUser.status === 201) {
    userClient.token = userClient.data(registerUser)?.accessToken;
    r.pass('POST /auth/register (Hrac user)');
  } else {
    r.fail('POST /auth/register (Hrac user)', userClient.errMsg(registerUser));
  }

  // ─── 4) /api/users/me (JWT verification) ────────────────────────────
  const me = await adminClient.req<{ id: string; username: string }>(
    'GET',
    '/users/me',
  );
  if (me.ok && adminClient.data(me)?.id === adminUserId) {
    r.pass('GET /users/me', 'JWT validní, vrátil sebe');
  } else {
    r.fail('GET /users/me', adminClient.errMsg(me));
  }

  // ─── 5) Vytvořit testovací svět ─────────────────────────────────────
  const worldSlug = `${SLUG_PREFIX}world-${RUN_ID}`;
  const worldName = `${TITLE_PREFIX}World_${RUN_ID}`;
  const createWorld = await adminClient.req<{ id: string; slug: string }>(
    'POST',
    '/worlds',
    {
      name: worldName,
      slug: worldSlug,
      accessMode: 'private',
      system: 'matrix',
    },
  );
  let worldId: string | undefined;
  if (createWorld.ok || createWorld.status === 201) {
    worldId = adminClient.data(createWorld)?.id;
    r.pass('POST /worlds', `worldId=${worldId}`);
  } else {
    r.fail('POST /worlds', adminClient.errMsg(createWorld));
    await cleanup(adminClient, worldId, []);
    r.summary();
    process.exit(1);
  }

  // ─── 6) Ověř world settings ─────────────────────────────────────────
  const settings = await adminClient.req<unknown>(
    'GET',
    `/worlds/${worldId}/settings`,
  );
  if (settings.ok) {
    r.pass('GET /worlds/:id/settings');
  } else {
    r.fail('GET /worlds/:id/settings', adminClient.errMsg(settings));
  }

  // ─── 7) Vytvořit stránku ────────────────────────────────────────────
  const pageSlug = `${SLUG_PREFIX}page-${RUN_ID}`;
  const createPage = await adminClient.req<{ id: string }>(
    'POST',
    `/worlds/${worldId}/pages`,
    {
      slug: pageSlug,
      type: 'Ostatní',
      title: `${TITLE_PREFIX}Page_${RUN_ID}`,
      content: 'Smoke test page',
    },
  );
  let pageId: string | undefined;
  if (createPage.ok || createPage.status === 201) {
    pageId = adminClient.data(createPage)?.id;
    r.pass('POST /worlds/:id/pages', `pageId=${pageId}`);
  } else {
    // Page type může vyžadovat jiné hodnoty — záleží na PAGE_TYPES enum.
    r.todo('POST /worlds/:id/pages', adminClient.errMsg(createPage));
  }

  // ─── 8) Vytvořit postavu (NPC) ──────────────────────────────────────
  const charSlug = `${SLUG_PREFIX}char-${RUN_ID}`;
  const createChar = await adminClient.req<{ id: string }>(
    'POST',
    `/worlds/${worldId}/characters`,
    {
      slug: charSlug,
      name: `${TITLE_PREFIX}Char_${RUN_ID}`,
      isNpc: true,
      publicBio: 'Smoke test character',
    },
  );
  let charId: string | undefined;
  if (createChar.ok || createChar.status === 201) {
    charId = adminClient.data(createChar)?.id;
    r.pass('POST /worlds/:id/characters', `charId=${charId}`);
  } else {
    r.fail('POST /worlds/:id/characters', adminClient.errMsg(createChar));
  }

  // ─── 9) NPC template ────────────────────────────────────────────────
  const createNpc = await adminClient.req<{ id: string }>(
    'POST',
    `/worlds/${worldId}/npc-templates`,
    {
      name: `${TITLE_PREFIX}NpcTpl_${RUN_ID}`,
      notes: 'Smoke test NPC template',
      maxHp: 10,
    },
  );
  let npcId: string | undefined;
  if (createNpc.ok || createNpc.status === 201) {
    npcId = adminClient.data(createNpc)?.id;
    r.pass('POST /worlds/:id/npc-templates', `id=${npcId}`);
  } else {
    r.fail('POST /worlds/:id/npc-templates', adminClient.errMsg(createNpc));
  }

  // ─── 10) Game event ─────────────────────────────────────────────────
  const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
  const createGameEvent = await adminClient.req<{ id: string }>(
    'POST',
    '/game-events',
    {
      worldId,
      title: `${TITLE_PREFIX}GameEvent_${RUN_ID}`,
      date: futureDate,
      description: 'Smoke test game event',
    },
  );
  let gameEventId: string | undefined;
  if (createGameEvent.ok || createGameEvent.status === 201) {
    gameEventId = adminClient.data(createGameEvent)?.id;
    r.pass('POST /game-events', `id=${gameEventId}`);
  } else {
    r.fail('POST /game-events', adminClient.errMsg(createGameEvent));
  }

  // ─── 11) Timeline event ─────────────────────────────────────────────
  const createTimeline = await adminClient.req<{ id: string }>(
    'POST',
    '/timeline',
    {
      worldId,
      year: 2026,
      month: 5,
      day: 7,
      title: `${TITLE_PREFIX}Timeline_${RUN_ID}`,
      text: 'Smoke test timeline event',
    },
  );
  let timelineId: string | undefined;
  if (createTimeline.ok || createTimeline.status === 201) {
    timelineId = adminClient.data(createTimeline)?.id;
    r.pass('POST /timeline', `id=${timelineId}`);
  } else {
    r.fail('POST /timeline', adminClient.errMsg(createTimeline));
  }

  // ─── 12) Weather generator ──────────────────────────────────────────
  const createWeather = await adminClient.req<{ id: string }>(
    'POST',
    `/worlds/${worldId}/weather-generators`,
    {
      name: `${TITLE_PREFIX}Weather_${RUN_ID}`,
      description: 'Smoke test generator',
      config: {
        tempMin: -10,
        tempMax: 30,
        tempUnit: 'C',
        weatherTypes: [
          {
            type: 'clear',
            label: 'Jasno',
            icon: 'sun',
            probability: 60,
            cloudRange: [0, 20],
            precipRange: [0, 0],
          },
          {
            type: 'rain',
            label: 'Déšť',
            icon: 'rain',
            probability: 40,
            cloudRange: [60, 100],
            precipRange: [1, 10],
          },
        ],
        windMin: 0,
        windMax: 30,
        windGustMultiplier: 1.5,
        pressureMin: 980,
        pressureMax: 1040,
        humidityMin: 30,
        humidityMax: 95,
      },
    },
  );
  let weatherId: string | undefined;
  if (createWeather.ok || createWeather.status === 201) {
    weatherId = adminClient.data(createWeather)?.id;
    r.pass('POST /worlds/:id/weather-generators', `id=${weatherId}`);
  } else {
    r.fail(
      'POST /worlds/:id/weather-generators',
      adminClient.errMsg(createWeather),
    );
  }

  // ─── 13) News item (per-world, vyžaduje role v dané world) ─────────
  const createNews = await adminClient.req<{ id: string }>('POST', '/news', {
    worldId,
    title: `${TITLE_PREFIX}News_${RUN_ID}`,
    content: 'Smoke test news content',
    type: 'info',
  });
  let newsId: string | undefined;
  if (createNews.ok || createNews.status === 201) {
    newsId = adminClient.data(createNews)?.id;
    r.pass('POST /news (per-world)', `id=${newsId}`);
  } else {
    r.fail('POST /news (per-world)', adminClient.errMsg(createNews));
  }

  // ─── 14) Article draft ──────────────────────────────────────────────
  const createArticle = await adminClient.req<{ id: string }>(
    'POST',
    '/ikaros-articles',
    {
      title: `${TITLE_PREFIX}Article_${RUN_ID}`,
      content: 'Smoke test article body',
      category: 'Ostatni',
    },
  );
  let articleId: string | undefined;
  if (createArticle.ok || createArticle.status === 201) {
    articleId = adminClient.data(createArticle)?.id;
    r.pass('POST /ikaros-articles', `id=${articleId}`);
  } else {
    r.fail('POST /ikaros-articles', adminClient.errMsg(createArticle));
  }

  // ─── 15) Auth-leak: /worlds/my bez JWT → 401 ────────────────────────
  const noAuth = new Client();
  const noAuthMy = await noAuth.req('GET', '/worlds/my', undefined, {
    auth: false,
  });
  if (noAuthMy.status === 401) {
    r.pass('GET /worlds/my bez JWT → 401');
  } else {
    r.fail(
      'GET /worlds/my bez JWT → 401',
      `dostal status ${noAuthMy.status}`,
    );
  }

  // ─── 16) Role-gating: Hrac nesmí psát do cizího světa ───────────────
  if (userClient.token && worldId) {
    const hracPage = await userClient.req(
      'POST',
      `/worlds/${worldId}/pages`,
      {
        slug: `${SLUG_PREFIX}hrac-attempt-${RUN_ID}`,
        type: 'Ostatní',
        title: `${TITLE_PREFIX}HracAttempt_${RUN_ID}`,
        content: 'Should not be created',
      },
    );
    if (hracPage.status === 403) {
      r.pass('Hrac POST /worlds/:id/pages → 403');
    } else {
      r.fail(
        'Hrac POST /worlds/:id/pages → 403',
        `dostal ${hracPage.status}: ${userClient.errMsg(hracPage)}`,
      );
    }

    // Hrac timeline
    const hracTimeline = await userClient.req('POST', '/timeline', {
      worldId,
      year: 2026,
      month: 5,
      day: 7,
      title: `${TITLE_PREFIX}HracTimeline_${RUN_ID}`,
      text: 'Should not be created',
    });
    if (hracTimeline.status === 403) {
      r.pass('Hrac POST /timeline → 403');
    } else {
      r.fail(
        'Hrac POST /timeline → 403',
        `dostal ${hracTimeline.status}: ${userClient.errMsg(hracTimeline)}`,
      );
    }

    // Hrac game event
    const hracGameEvent = await userClient.req('POST', '/game-events', {
      worldId,
      title: `${TITLE_PREFIX}HracGameEvent_${RUN_ID}`,
      date: futureDate,
    });
    if (hracGameEvent.status === 403) {
      r.pass('Hrac POST /game-events → 403');
    } else {
      r.fail(
        'Hrac POST /game-events → 403',
        `dostal ${hracGameEvent.status}: ${userClient.errMsg(hracGameEvent)}`,
      );
    }

    // Systematický audit role gating napříč moduly:
    // Pro každou write metodu zkontroluj, že Hrac dostane 403 (ne 201/200).
    // 400 (validation error) je akceptovatelné pouze pokud auth check
    // proběhne PŘED validací — jinak by to byl info-leak (validátor může
    // odhalit schéma resource a sloužit jako oracle).
    const gatingChecks: Array<{
      label: string;
      method: string;
      path: string;
      body: unknown;
    }> = [
      {
        label: 'Hrac POST /worlds/:id/characters',
        method: 'POST',
        path: `/worlds/${worldId}/characters`,
        body: {
          slug: `${SLUG_PREFIX}hrac-char-${RUN_ID}`,
          name: `${TITLE_PREFIX}HracChar_${RUN_ID}`,
          isNpc: true,
        },
      },
      {
        label: 'Hrac POST /worlds/:id/npc-templates',
        method: 'POST',
        path: `/worlds/${worldId}/npc-templates`,
        body: { name: `${TITLE_PREFIX}HracNpc_${RUN_ID}` },
      },
      {
        label: 'Hrac POST /worlds/:id/weather-generators',
        method: 'POST',
        path: `/worlds/${worldId}/weather-generators`,
        body: {
          name: `${TITLE_PREFIX}HracW_${RUN_ID}`,
          config: {
            tempMin: 0,
            tempMax: 30,
            weatherTypes: [
              {
                type: 'clear',
                label: 'C',
                icon: 'i',
                probability: 100,
                cloudRange: [0, 10],
                precipRange: [0, 0],
              },
            ],
            windMin: 0,
            windMax: 10,
            windGustMultiplier: 1,
            pressureMin: 1000,
            pressureMax: 1020,
            humidityMin: 30,
            humidityMax: 70,
          },
        },
      },
      {
        label: 'Hrac POST /news (per-world)',
        method: 'POST',
        path: '/news',
        body: {
          worldId,
          title: `${TITLE_PREFIX}HracNews_${RUN_ID}`,
          content: 'should be denied',
        },
      },
      {
        label: 'Hrac POST /maps',
        method: 'POST',
        path: '/maps',
        body: { worldId, name: `${TITLE_PREFIX}HracMap_${RUN_ID}` },
      },
      {
        label: 'Hrac POST /dungeon-maps',
        method: 'POST',
        path: '/dungeon-maps',
        body: { worldId, name: `${TITLE_PREFIX}HracDM_${RUN_ID}` },
      },
      {
        label: 'Hrac PUT /worlds/:id/calendar-config',
        method: 'PUT',
        path: `/worlds/${worldId}/calendar-config`,
        body: {
          monthsPerYear: 12,
          daysPerMonth: 30,
          hoursPerDay: 24,
        },
      },
      {
        label: 'Hrac PUT /worlds/:id/settings',
        method: 'PUT',
        path: `/worlds/${worldId}/settings`,
        body: { hiddenNavItems: [] },
      },
      {
        label: 'Hrac POST /emotes/:worldId',
        method: 'POST',
        path: `/emotes/${worldId}`,
        body: { code: 'hracemote', imageUrl: 'https://example.com/e.png' },
      },
      {
        label: 'Hrac PATCH /worlds/:id (update world)',
        method: 'PATCH',
        path: `/worlds/${worldId}`,
        body: { description: 'hijacked by Hrac' },
      },
    ];

    for (const gc of gatingChecks) {
      const res = await userClient.req(gc.method, gc.path, gc.body);
      if (res.status === 403) {
        r.pass(`${gc.label} → 403`);
      } else if (res.status === 200 || res.status === 201) {
        r.fail(`${gc.label} → 403`, `BUG: dostal ${res.status} (write prošel)`);
      } else if (res.status === 404) {
        // Auth-required pattern: 404 pokud requester nemá přístup ke světu.
        // Některé moduly mohou vracet 404 místo 403 — zalogovat, ale nehlásit FAIL.
        r.pass(`${gc.label} → 403`, `(akceptováno: ${res.status} ${userClient.errMsg(res)})`);
      } else {
        // 400 (validation) může předbíhat auth = info-leak. Stále lepší než 201.
        r.todo(
          `${gc.label} → 403`,
          `dostal ${res.status}: ${userClient.errMsg(res)} (možná validátor předbíhá auth)`,
        );
      }
    }
  } else {
    r.todo('Role-gating Hrac mutace', 'Hrac uživatel se nezaregistroval');
  }

  // ─── Cleanup ────────────────────────────────────────────────────────
  console.log('\nCleanup TEST_VERIFICATION_ dat:');
  await cleanup(adminClient, worldId, [
    { path: `/timeline/${timelineId}`, label: 'timeline event', id: timelineId },
    { path: `/game-events/${gameEventId}`, label: 'game event', id: gameEventId },
    {
      path: `/worlds/${worldId}/weather-generators/${weatherId}`,
      label: 'weather generator',
      id: weatherId,
    },
    {
      path: `/worlds/${worldId}/npc-templates/${npcId}`,
      label: 'npc template',
      id: npcId,
    },
    {
      path: `/worlds/${worldId}/characters/${charSlug}`,
      label: 'character',
      id: charId,
    },
    { path: `/worlds/${worldId}/pages/${pageId}`, label: 'page', id: pageId },
    { path: `/news/${newsId}`, label: 'news', id: newsId },
    { path: `/ikaros-articles/${articleId}`, label: 'article', id: articleId },
  ]);

  if (worldId) {
    const delWorld = await adminClient.req('DELETE', `/worlds/${worldId}`);
    if (delWorld.ok) {
      console.log(`  cleaned: world ${worldId}`);
    } else {
      console.log(
        `  WARN: nelze smazat svět ${worldId}: ${adminClient.errMsg(delWorld)}`,
      );
    }
  }

  // ─── Souhrn ─────────────────────────────────────────────────────────
  const { allPassed } = r.summary();
  process.exit(allPassed ? 0 : 1);
}

interface CleanupItem {
  path: string;
  label: string;
  id?: string;
}

async function cleanup(
  client: Client,
  worldId: string | undefined,
  items: CleanupItem[],
): Promise<void> {
  void worldId;
  for (const item of items) {
    if (!item.id) continue;
    const res = await client.req('DELETE', item.path);
    if (res.ok || res.status === 204) {
      console.log(`  cleaned: ${item.label} ${item.id}`);
    } else {
      console.log(
        `  WARN: nelze smazat ${item.label} ${item.id} (${res.status}): ${client.errMsg(res)}`,
      );
    }
  }
}

run().catch((err: unknown) => {
  console.error('\n[fatal] smoke test crashed:', err);
  process.exit(1);
});

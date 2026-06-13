import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Connection } from 'mongoose';
import { registerUser, authHeader, type AuthSession } from './auth';

/**
 * Seed-scenario kanonický builder (audit „Seed scenario smoke", oblast 00/B).
 *
 * Postaví jeden deterministický svět průchodem aplikací v pořadí reálné session:
 * uživatel → svět → člen → stránka → postava → chat → mapa. Granulární kroky
 * (každý vrací delta), aby šel scénář zastavit (FA fault injection), zdvojit
 * (RC race / IS izolace) nebo parametrizovat (PB). Happy-path: každý krok MUSÍ
 * uspět, jinak `expectOk` hodí → smoke (L2) je zelený jen když projde celý řetěz.
 *
 * `WorldRole` (numerický enum): Zadatel=0 Ctenar=1 Hrac=2 Korektor=3 PomocnyPJ=4 PJ=5.
 */

export const WorldRole = {
  Zadatel: 0,
  Ctenar: 1,
  Hrac: 2,
  Korektor: 3,
  PomocnyPJ: 4,
  PJ: 5,
} as const;

export interface CanonicalSeed {
  pj: AuthSession;
  hrac: AuthSession;
  worldId: string;
  worldSlug: string;
  membershipId: string;
  pageSlug: string;
  personaPageSlug: string;
  characterId: string;
  characterSlug: string;
  npcId: string;
  chatGroupId: string;
  chatChannelId: string;
  messageId: string;
  sceneId: string;
}

let seq = 0;
/** Deterministický suffix v rámci procesu (unikátní slugy/usernames). */
export function nextSuffix(prefix = 'ss'): string {
  seq += 1;
  return `${prefix}${seq}`;
}

type Body = { id?: string; _id?: string } & Record<string, unknown>;
const idOf = (body: Body): string => String(body?.id ?? body?._id ?? '');
const api = (app: INestApplication) => request(app.getHttpServer());

/** Spustí supertest volání, hodí s diagnostikou, když status není v `ok`. */
async function expectOk(
  p: request.Test,
  label: string,
  ok: number[] = [200, 201],
): Promise<request.Response> {
  const res = await p;
  if (!ok.includes(res.status)) {
    throw new Error(
      `[seed:${label}] čekal ${ok.join('/')}, dostal ${res.status} — ${JSON.stringify(res.body)}`,
    );
  }
  return res;
}

const PASSWORD = 'Password123!';

/** Postaví celý kanonický svět. Throw při jakémkoli ne-2xx kroku (= L2 smoke). */
export async function buildCanonicalWorld(
  app: INestApplication,
  conn: Connection,
  opts: { suffix?: string } = {},
): Promise<CanonicalSeed> {
  const sfx = opts.suffix ?? nextSuffix();
  const db = conn.db!;

  // ── 01 Uživatel ──────────────────────────────────────────
  const pj = await registerUser(app, {
    username: `pj-${sfx}`,
    email: `pj-${sfx}@test.io`,
    password: PASSWORD,
  });
  const hrac = await registerUser(app, {
    username: `hrac-${sfx}`,
    email: `hrac-${sfx}@test.io`,
    password: PASSWORD,
  });

  // ── 02 Svět (private → access-request flow) ───────────────
  const worldSlug = `world-${sfx}`;
  const wRes = await expectOk(
    api(app)
      .post('/api/worlds')
      .set(authHeader(pj.accessToken))
      .send({
        name: `Svět ${sfx}`,
        slug: worldSlug,
        genre: 'fantasy',
        system: 'dnd5e',
        accessMode: 'private',
        description: 'Seed scénář svět',
      }),
    'create-world',
  );
  const worldId = idOf(wRes.body as Body);

  // ── 03 Člen: access-request → approve → role Hrac ─────────
  const arRes = await expectOk(
    api(app)
      .post(`/api/worlds/${worldId}/access-request`)
      .set(authHeader(hrac.accessToken)),
    'access-request',
  );
  const requestId = idOf(arRes.body as Body);
  await expectOk(
    api(app)
      .post(`/api/worlds/${worldId}/access-requests/${requestId}/approve`)
      .set(authHeader(pj.accessToken)),
    'approve',
  );
  const membershipDoc = await db
    .collection('worldmemberships')
    .findOne({ worldId, userId: hrac.userId });
  const membershipId = String(membershipDoc?._id ?? '');
  if (!membershipId) throw new Error('[seed] membership po approve nenalezen');
  await expectOk(
    api(app)
      .patch(`/api/worlds/${worldId}/members/${membershipId}/role`)
      .set(authHeader(pj.accessToken))
      .send({ role: WorldRole.Hrac }),
    'set-role-Hrac',
  );

  // ── 04 Stránka: běžná + persona (→ Character side-effect) ──
  const pageSlug = `page-${sfx}`;
  await expectOk(
    api(app)
      .post(`/api/worlds/${worldId}/pages`)
      .set(authHeader(pj.accessToken))
      .send({
        slug: pageSlug,
        type: 'Ostatní',
        title: `Stránka ${sfx}`,
        content: '<p>obsah</p>',
      }),
    'create-page',
  );
  const personaPageSlug = `persona-${sfx}`;
  await expectOk(
    api(app)
      .post(`/api/worlds/${worldId}/pages`)
      .set(authHeader(pj.accessToken))
      .send({
        slug: personaPageSlug,
        type: 'Postava hráče',
        title: `Persona ${sfx}`,
        ownerUserId: hrac.userId,
      }),
    'create-persona-page',
  );
  // Persona page auto-vytvoří Character se slug = slug stránky (pages.service:215).
  const characterSlug = personaPageSlug;
  const charDoc = await db
    .collection('characters')
    .findOne({ worldId, slug: characterSlug });
  const characterId = String(charDoc?._id ?? '');
  if (!characterId) throw new Error('[seed] persona Character nevznikl');

  // ── 05 Postava: NPC přes přímý endpoint ───────────────────
  const npcRes = await expectOk(
    api(app)
      .post(`/api/worlds/${worldId}/characters`)
      .set(authHeader(pj.accessToken))
      .send({ slug: `npc-${sfx}`, name: `NPC ${sfx}`, isNpc: true }),
    'create-npc',
  );
  const npcId = idOf(npcRes.body as Body);

  // Přiřazení PC postavy členovi (→ characterPath, auto soukromá konverzace).
  await expectOk(
    api(app)
      .patch(`/api/worlds/${worldId}/members/${membershipId}/character`)
      .set(authHeader(pj.accessToken))
      .send({ characterPath: characterSlug }),
    'assign-character',
  );

  // ── 06 Chat: group (kanál) + channel (konverzace) + zpráva ─
  const groupRes = await expectOk(
    api(app)
      .post(`/api/worlds/${worldId}/chat/groups`)
      .set(authHeader(pj.accessToken))
      .send({ name: `Kanál ${sfx}` }),
    'create-chat-group',
  );
  const chatGroupId = idOf(groupRes.body as Body);
  const channelRes = await expectOk(
    api(app)
      .post(`/api/worlds/${worldId}/chat/groups/${chatGroupId}/channels`)
      .set(authHeader(pj.accessToken))
      .send({ name: `Konverzace ${sfx}` }),
    'create-chat-channel',
  );
  const chatChannelId = idOf(channelRes.body as Body);
  const msgRes = await expectOk(
    api(app)
      .post(`/api/worlds/${worldId}/chat/channels/${chatChannelId}/messages`)
      .set(authHeader(pj.accessToken))
      .send({ content: `Ahoj ze seed scénáře ${sfx}` }),
    'create-chat-message',
  );
  const messageId = idOf(msgRes.body as Body);

  // ── 07 Mapa: scéna ────────────────────────────────────────
  const sceneRes = await expectOk(
    api(app)
      .post('/api/maps')
      .set(authHeader(pj.accessToken))
      .send({ worldId, name: `Scéna ${sfx}` }),
    'create-scene',
  );
  const sceneId = idOf(sceneRes.body as Body);

  return {
    pj,
    hrac,
    worldId,
    worldSlug,
    membershipId,
    pageSlug,
    personaPageSlug,
    characterId,
    characterSlug,
    npcId,
    chatGroupId,
    chatChannelId,
    messageId,
    sceneId,
  };
}

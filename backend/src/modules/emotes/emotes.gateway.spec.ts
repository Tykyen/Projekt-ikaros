import { EmotesGateway } from './emotes.gateway';
import type { CustomEmote } from './interfaces/custom-emote.interface';
import type { Server } from 'socket.io';

/** Mock Socket.IO serveru — zachytává `.to(room).emit(...)` a `.emit(...)`
 *  (globální broadcast bez roomu). */
function mockServer() {
  const emit = jest.fn();
  const toEmit = jest.fn();
  const to = jest.fn(() => ({ emit: toEmit }));
  return { server: { to, emit } as unknown as Server, to, toEmit, emit };
}

function makeEmote(overrides: Partial<CustomEmote> = {}): CustomEmote {
  return {
    id: 'e1',
    worldId: 'w1',
    name: 'Pepega',
    shortcode: 'pepega',
    imageId: 'cloud-id-1',
    imageUrl: 'https://cdn/e1.png',
    createdBy: 'secret-author-id',
    tags: ['meme'],
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

// FIX-B část 1 (2026-07) — `world:{worldId}` room se joinne bez membership
// kontroly (N-8) → plný CustomEmote (vč. createdBy = userId autora) unikal
// komukoli v roomu. FE `createdBy` z WS eventu nečte (jen z REST), takže
// stripnutí je bezpečné a zpětně kompatibilní.
describe('EmotesGateway — FIX-B leak-safe payload', () => {
  let gateway: EmotesGateway;
  let srv: ReturnType<typeof mockServer>;

  beforeEach(() => {
    gateway = new EmotesGateway();
    srv = mockServer();
    gateway.server = srv.server;
  });

  it('emote.created (per-svět) → emit BEZ createdBy, ostatní pole zachována', () => {
    const emote = makeEmote();
    gateway.handleEmoteCreated({ worldId: 'w1', emote });

    expect(srv.to).toHaveBeenCalledWith('world:w1');
    const sent = srv.toEmit.mock.calls[0][1] as Record<string, unknown>;
    expect(sent).not.toHaveProperty('createdBy');
    expect(sent).toMatchObject({
      id: 'e1',
      name: 'Pepega',
      shortcode: 'pepega',
      imageUrl: 'https://cdn/e1.png',
      worldId: 'w1',
      imageId: 'cloud-id-1',
      tags: ['meme'],
    });
  });

  it('emote.created (globální, worldId null) → broadcast BEZ createdBy', () => {
    const emote = makeEmote({ worldId: null });
    gateway.handleEmoteCreated({ worldId: null, emote });

    expect(srv.emit).toHaveBeenCalledWith(
      'emote:created-global',
      expect.not.objectContaining({ createdBy: expect.anything() }),
    );
    const sent = srv.emit.mock.calls[0][1] as Record<string, unknown>;
    expect(sent).not.toHaveProperty('createdBy');
  });

  it('emote.updated (per-svět) → emit BEZ createdBy', () => {
    const emote = makeEmote({ name: 'PepegaV2' });
    gateway.handleEmoteUpdated({ worldId: 'w1', emote });

    const sent = srv.toEmit.mock.calls[0][1] as Record<string, unknown>;
    expect(sent).not.toHaveProperty('createdBy');
    expect(sent.name).toBe('PepegaV2');
  });

  it('emote.updated (globální) → broadcast BEZ createdBy', () => {
    const emote = makeEmote({ worldId: null });
    gateway.handleEmoteUpdated({ worldId: null, emote });

    const sent = srv.emit.mock.calls[0][1] as Record<string, unknown>;
    expect(sent).not.toHaveProperty('createdBy');
  });

  it('emote.deleted nemění chování (jen emoteId, nikdy nenesl createdBy)', () => {
    gateway.handleEmoteDeleted({ worldId: 'w1', emoteId: 'e1' });
    expect(srv.to).toHaveBeenCalledWith('world:w1');
    expect(srv.toEmit).toHaveBeenCalledWith('emote:deleted', {
      emoteId: 'e1',
    });
  });
});

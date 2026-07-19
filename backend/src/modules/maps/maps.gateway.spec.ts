import { MapsGateway } from './maps.gateway';
import { UserRole } from '../users/interfaces/user.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

/**
 * Pojistka pro plný audit 2026-06-20:
 *  - W-RUN-07-02 / R-RUN-02 — `map:join` role/scene gate (Zadatel i cizí scéna).
 *  - W-RUN-07-03 — `map:ping` cross-scene spoof (jen scéna, kde klient je).
 */
describe('MapsGateway — map:join / map:ping access gate', () => {
  const scene = { id: 'scene1', worldId: 'w1' };
  let mapsRepo: { findById: jest.Mock };
  let membershipRepo: { findByUserAndWorld: jest.Mock };
  let elevationService: { isElevated: jest.Mock };
  let gateway: MapsGateway;

  beforeEach(() => {
    mapsRepo = { findById: jest.fn().mockResolvedValue(scene) };
    membershipRepo = { findByUserAndWorld: jest.fn() };
    // De-elevated default — testy gate předpokládají, že admin bypass je vypnutý.
    elevationService = { isElevated: jest.fn().mockResolvedValue(false) };
    gateway = new MapsGateway(
      {} as never,
      mapsRepo as never,
      membershipRepo as never,
      elevationService as never,
    );
  });

  function makeClient(rooms: string[] = []) {
    const emit = jest.fn();
    const join = jest.fn();
    const toEmit = jest.fn();
    return {
      data: { user: { id: 'u1', role: UserRole.Hrac } },
      rooms: new Set(rooms),
      emit,
      join,
      // ephemeral eventy (ping/ruler) jdou přes `.volatile.emit` (drop pro
      // pomalé klienty) — mock routuje `.emit` i `.volatile.emit` na tentýž spy.
      to: jest.fn(() => ({ emit: toEmit, volatile: { emit: toEmit } })),
      _toEmit: toEmit,
    };
  }

  it('map:join — Zadatel (pending) dostane MAP_FORBIDDEN a nejoinuje', async () => {
    membershipRepo.findByUserAndWorld.mockResolvedValue({
      role: WorldRole.Zadatel,
      currentSceneId: undefined,
    });
    const client = makeClient();
    await gateway.handleJoin('scene1', client as never);
    expect(client.join).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ code: 'MAP_FORBIDDEN' }),
    );
  });

  it('map:join — Hráč s cizí (nepřiřazenou) scénou dostane MAP_FORBIDDEN', async () => {
    membershipRepo.findByUserAndWorld.mockResolvedValue({
      role: WorldRole.Hrac,
      currentSceneId: 'jina-scena',
    });
    const client = makeClient();
    await gateway.handleJoin('scene1', client as never);
    expect(client.join).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ code: 'MAP_FORBIDDEN' }),
    );
  });

  it('map:join — Hráč s vlastní currentSceneId smí join', async () => {
    membershipRepo.findByUserAndWorld.mockResolvedValue({
      role: WorldRole.Hrac,
      currentSceneId: 'scene1',
    });
    const client = makeClient();
    await gateway.handleJoin('scene1', client as never);
    expect(client.join).toHaveBeenCalledWith('scene1');
  });

  it('map:join — PomocnyPJ smí join libovolnou scénu', async () => {
    membershipRepo.findByUserAndWorld.mockResolvedValue({
      role: WorldRole.PomocnyPJ,
      currentSceneId: undefined,
    });
    const client = makeClient();
    await gateway.handleJoin('scene1', client as never);
    expect(client.join).toHaveBeenCalledWith('scene1');
  });

  it('map:ping — klient mimo scénu (room) nic nebroadcastuje', () => {
    const client = makeClient([]); // není v žádném roomu
    gateway.handlePing(
      { sceneId: 'scene1', x: 1, y: 2, userName: 'X' },
      client as never,
    );
    expect(client.to).not.toHaveBeenCalled();
  });

  it('map:ping — klient ve scéně broadcastne do té scény', () => {
    const client = makeClient(['scene1']);
    gateway.handlePing(
      { sceneId: 'scene1', x: 1, y: 2, userName: 'X' },
      client as never,
    );
    expect(client.to).toHaveBeenCalledWith('scene1');
    expect(client._toEmit).toHaveBeenCalledWith('map:pinged', 1, 2, 'X');
  });
});

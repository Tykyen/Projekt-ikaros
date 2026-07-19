import { WorldAccessRequestProvider } from './world-access-request.provider';
import { WorldRole } from './interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

/**
 * 15.10 — scope fix: pending fronta žádostí o vstup se scopuje na světy, které
 * user VLASTNÍ NEBO kde je co-PJ (role ≥ PJ). Dřív jen `findByOwnerId`, takže
 * co-PJ měl právo schválit, ale žádost ve frontě vůbec neviděl.
 *
 * R-20 fix: platform Admin/Superadmin NEMÁ globální scope — world-governance
 * (žádost o vstup) je věc PJe, ne platformy. Dřív `undefined` = všechny AR
 * napříč platformou; rozešlo se se schvalovací bránou (403 bez elevace).
 */
describe('WorldAccessRequestProvider — scope (15.10)', () => {
  const worldsRepo = { findByOwnerId: jest.fn(), findByIds: jest.fn() };
  const accessRequestRepo = {
    countAcrossWorlds: jest.fn().mockResolvedValue(0),
    findPaginatedAcrossWorlds: jest.fn(),
  };
  const membershipRepo = { findByUserId: jest.fn() };
  const usersService = { publicProfile: jest.fn() };

  const provider = new WorldAccessRequestProvider(
    worldsRepo as never,
    accessRequestRepo as never,
    membershipRepo as never,
    usersService as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('co-PJ svět (role PJ) je ve scope; role < PJ ne', async () => {
    worldsRepo.findByOwnerId.mockResolvedValue([]); // nic nevlastní
    membershipRepo.findByUserId.mockResolvedValue([
      { worldId: 'w2', role: WorldRole.PJ },
      { worldId: 'w3', role: WorldRole.PomocnyPJ }, // 4 < 5 → mimo
      { worldId: 'w4', role: WorldRole.Ctenar },
    ]);

    await provider.countForUser('u1', UserRole.Ikarus);

    expect(accessRequestRepo.countAcrossWorlds).toHaveBeenCalledWith(['w2']);
  });

  it('vlastník + co-PJ se sjednotí a deduplikují', async () => {
    worldsRepo.findByOwnerId.mockResolvedValue([{ id: 'w1' }]);
    membershipRepo.findByUserId.mockResolvedValue([
      { worldId: 'w1', role: WorldRole.PJ }, // duplikát vlastněného
      { worldId: 'w2', role: WorldRole.PJ },
    ]);

    await provider.countForUser('u1', UserRole.Ikarus);

    const arg = accessRequestRepo.countAcrossWorlds.mock.calls[0][0];
    expect([...arg].sort()).toEqual(['w1', 'w2']);
  });

  it('Admin BEZ globálního bypassu — scope jako každý (owner + co-PJ)', async () => {
    // R-20: platform role sama o sobě frontu žádostí o vstup nedává.
    worldsRepo.findByOwnerId.mockResolvedValue([]);
    membershipRepo.findByUserId.mockResolvedValue([
      { worldId: 'w9', role: WorldRole.PJ },
    ]);

    await provider.countForUser('admin', UserRole.Admin);

    // NE undefined (to by byl global scope) — scope se počítá z ownership/co-PJ.
    expect(accessRequestRepo.countAcrossWorlds).toHaveBeenCalledWith(['w9']);
    expect(membershipRepo.findByUserId).toHaveBeenCalledWith('admin');
  });

  it('Admin bez vlastního světa ani co-PJ role → prázdný scope (0 AR)', async () => {
    worldsRepo.findByOwnerId.mockResolvedValue([]);
    membershipRepo.findByUserId.mockResolvedValue([
      { worldId: 'wX', role: WorldRole.Ctenar }, // hráč → mimo
    ]);

    await provider.countForUser('admin', UserRole.Superadmin);

    expect(accessRequestRepo.countAcrossWorlds).toHaveBeenCalledWith([]);
  });
});

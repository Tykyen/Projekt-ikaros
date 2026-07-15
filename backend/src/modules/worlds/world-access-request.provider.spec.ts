import { WorldAccessRequestProvider } from './world-access-request.provider';
import { WorldRole } from './interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

/**
 * 15.10 — scope fix: pending fronta žádostí o vstup se scopuje na světy, které
 * user VLASTNÍ NEBO kde je co-PJ (role ≥ PJ). Dřív jen `findByOwnerId`, takže
 * co-PJ měl právo schválit, ale žádost ve frontě vůbec neviděl.
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

  it('Admin → global scope (undefined), bez lookupu membershipů', async () => {
    await provider.countForUser('admin', UserRole.Admin);
    expect(accessRequestRepo.countAcrossWorlds).toHaveBeenCalledWith(undefined);
    expect(membershipRepo.findByUserId).not.toHaveBeenCalled();
  });
});

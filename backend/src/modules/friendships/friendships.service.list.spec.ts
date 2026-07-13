import { FriendshipsService } from './friendships.service';
import { UserRole } from '../users/interfaces/user.interface';

/**
 * Regrese D-xxx: `GET /friends` musel vracet enriched `friend` objekt
 * (FE crashoval na `f.friend.id`, protože BE posílal jen surový friendship).
 */
function makeService(opts: {
  accepted: Array<{
    id: string;
    requesterId: string;
    recipientId: string;
    acceptedAt?: Date;
  }>;
  users: Record<string, Record<string, unknown> | null>;
  /** D-NEW-INV-PROFILE — mock counts (chybějící id v mapě → service fallback 0). */
  worldsCounts?: Record<string, number>;
}) {
  const friendsRepo = {
    listAcceptedForUser: jest
      .fn()
      .mockResolvedValue({ items: opts.accepted, total: opts.accepted.length }),
  };
  const usersRepo = {
    findById: jest.fn((id: string) => Promise.resolve(opts.users[id] ?? null)),
  };
  const membershipRepo = {
    countsByUserIdsExcludingDeletedWorlds: jest.fn(() =>
      Promise.resolve(
        new Map<string, number>(Object.entries(opts.worldsCounts ?? {})),
      ),
    ),
  };
  const svc = new FriendshipsService(
    usersRepo as never,
    friendsRepo as never,
    {} as never,
    membershipRepo as never,
    { emit: jest.fn() } as never,
  );
  return { svc, membershipRepo };
}

describe('FriendshipsService.listForUser — enrichment', () => {
  it('dohledá protějška (ten z dvojice, který není aktuální uživatel)', async () => {
    const { svc } = makeService({
      accepted: [
        {
          id: 'f1',
          requesterId: 'me',
          recipientId: 'other',
          acceptedAt: new Date(),
        },
      ],
      users: {
        other: {
          id: 'other',
          username: 'Kamarad',
          displayName: 'Kámoš',
          avatarUrl: 'http://x/a.png',
          defaultAvatarType: 'female',
          role: UserRole.PJ,
          city: 'Praha',
          isDeleted: false,
        },
      },
    });
    const { items } = await svc.listForUser('me', 1, 20);
    expect(items).toHaveLength(1);
    expect(items[0].friendshipId).toBe('f1');
    expect(items[0].friend).toMatchObject({
      id: 'other',
      username: 'Kamarad',
      displayName: 'Kámoš',
      defaultAvatarType: 'female',
      role: UserRole.PJ,
      deleted: false,
      pendingDeletion: false,
    });
  });

  it('protějšek funguje i když jsem recipient (ne requester)', async () => {
    const { svc } = makeService({
      accepted: [{ id: 'f2', requesterId: 'other', recipientId: 'me' }],
      users: { other: { id: 'other', username: 'Druhy', role: UserRole.Hrac } },
    });
    const { items } = await svc.listForUser('me', 1, 20);
    expect(items[0].friend.id).toBe('other');
    expect(items[0].friend.username).toBe('Druhy');
  });

  it('smazaný / nedohledaný účet → placeholder „neznámý", deleted=true bez crashe', async () => {
    const { svc } = makeService({
      accepted: [{ id: 'f3', requesterId: 'me', recipientId: 'ghost' }],
      users: { ghost: null },
    });
    const { items } = await svc.listForUser('me', 1, 20);
    expect(items[0].friend.id).toBe('ghost');
    expect(items[0].friend.username).toBe('neznámý');
    expect(items[0].friend.deleted).toBe(false);
    expect(items[0].friend.role).toBe(UserRole.Hrac);
  });

  it('pendingDeletion=true když má účet deletionRequestedAt', async () => {
    const { svc } = makeService({
      accepted: [{ id: 'f4', requesterId: 'me', recipientId: 'leaving' }],
      users: {
        leaving: {
          id: 'leaving',
          username: 'Odchazi',
          role: UserRole.Hrac,
          deletionRequestedAt: new Date(),
        },
      },
    });
    const { items } = await svc.listForUser('me', 1, 20);
    expect(items[0].friend.pendingDeletion).toBe(true);
  });

  // ── D-NEW-INV-PROFILE — worldsCount ve friend shape ──────────────────

  it('worldsCount: 1 batch dotaz pro celou stránku (žádný N+1) + hodnoty z agregace', async () => {
    const { svc, membershipRepo } = makeService({
      accepted: [
        { id: 'f1', requesterId: 'me', recipientId: 'friendA' },
        { id: 'f2', requesterId: 'friendB', recipientId: 'me' },
      ],
      users: {
        friendA: { id: 'friendA', username: 'A', role: UserRole.Hrac },
        friendB: { id: 'friendB', username: 'B', role: UserRole.Hrac },
      },
      worldsCounts: { friendA: 3, friendB: 0 },
    });
    const { items } = await svc.listForUser('me', 1, 20);
    expect(items[0].friend.worldsCount).toBe(3);
    expect(items[1].friend.worldsCount).toBe(0);
    // Jediné volání s VŠEMI friend IDs najednou — repo varianta vylučující
    // soft-smazané světy.
    expect(
      membershipRepo.countsByUserIdsExcludingDeletedWorlds,
    ).toHaveBeenCalledTimes(1);
    expect(
      membershipRepo.countsByUserIdsExcludingDeletedWorlds,
    ).toHaveBeenCalledWith(['friendA', 'friendB']);
  });

  it('worldsCount: přítel chybějící v counts mapě → fallback 0', async () => {
    const { svc } = makeService({
      accepted: [{ id: 'f1', requesterId: 'me', recipientId: 'ghost' }],
      users: { ghost: { id: 'ghost', username: 'G', role: UserRole.Hrac } },
      // worldsCounts neuvedeny → prázdná mapa → service musí doplnit 0.
    });
    const { items } = await svc.listForUser('me', 1, 20);
    expect(items[0].friend.worldsCount).toBe(0);
  });
});

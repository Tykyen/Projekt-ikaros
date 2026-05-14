import type { IWorldMembershipRepository } from '../../worlds/interfaces/world-membership-repository.interface';
import type { IWorldsRepository } from '../../worlds/interfaces/worlds-repository.interface';
import type { IUsersRepository } from '../interfaces/users-repository.interface';
import { WorldRole } from '../../worlds/interfaces/world-membership.interface';

export interface HandoverDeps {
  membershipRepo: IWorldMembershipRepository;
  worldsRepo: IWorldsRepository;
  usersRepo: IUsersRepository;
}

export interface HandoverPromotion {
  worldId: string;
  worldName: string;
  worldSlug: string;
  promotedUserId: string;
  promotedUsername: string;
}

export interface HandoverBlocker {
  worldId: string;
  worldName: string;
  worldSlug: string;
}

export interface HandoverPlan {
  promotions: HandoverPromotion[];
  blocking: HandoverBlocker[];
}

/**
 * D-037 — když user (PJ) se maže/banuje, vyhodnotí situaci ve světech:
 *  - target je PJ ve worldX
 *  - pokud worldX má další PJ → no action (redundance)
 *  - pokud worldX má PomocnyPJ → promotion (vrátí nejstaršího)
 *  - jinak → blocker (admin musí ručně rozhodnout)
 */
export async function assessPJHandover(
  userId: string,
  deps: HandoverDeps,
): Promise<HandoverPlan> {
  const memberships = await deps.membershipRepo.findByUserId(userId);
  const pjMemberships = memberships.filter((m) => m.role === WorldRole.PJ);

  const promotions: HandoverPromotion[] = [];
  const blocking: HandoverBlocker[] = [];

  for (const m of pjMemberships) {
    const allInWorld = await deps.membershipRepo.findByWorldId(m.worldId);
    const otherPJs = allInWorld.filter(
      (x) => x.userId !== userId && x.role === WorldRole.PJ,
    );
    if (otherPJs.length > 0) {
      continue;
    }
    const helpers = allInWorld.filter((x) => x.role === WorldRole.PomocnyPJ);
    if (helpers.length === 0) {
      const world = await deps.worldsRepo.findById(m.worldId);
      blocking.push({
        worldId: m.worldId,
        worldName: world?.name ?? '',
        worldSlug: world?.slug ?? '',
      });
      continue;
    }
    const sorted = [...helpers].sort(
      (a, b) => a.joinedAt.getTime() - b.joinedAt.getTime(),
    );
    const promoted = sorted[0];
    const [world, promotedUser] = await Promise.all([
      deps.worldsRepo.findById(m.worldId),
      deps.usersRepo.findById(promoted.userId),
    ]);
    promotions.push({
      worldId: m.worldId,
      worldName: world?.name ?? '',
      worldSlug: world?.slug ?? '',
      promotedUserId: promoted.userId,
      promotedUsername: promotedUser?.username ?? '',
    });
  }

  return { promotions, blocking };
}

/**
 * Provede plán: pro každou promotion update membership.role na PJ.
 */
export async function executePJHandover(
  plan: HandoverPlan,
  deps: { membershipRepo: IWorldMembershipRepository },
): Promise<void> {
  for (const p of plan.promotions) {
    const m = await deps.membershipRepo.findByUserAndWorld(
      p.promotedUserId,
      p.worldId,
    );
    if (m) {
      await deps.membershipRepo.update(m.id, { role: WorldRole.PJ });
    }
  }
}

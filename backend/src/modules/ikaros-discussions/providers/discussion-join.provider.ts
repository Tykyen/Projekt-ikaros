import { Injectable, Inject } from '@nestjs/common';
import type { IPendingActionProvider } from '../../pending-actions/pending-action-provider.interface';
import { PendingActionType } from '../../pending-actions/pending-action-type.enum';
import { UserRole } from '../../users/interfaces/user.interface';
import type { IIkarosDiscussionsRepository } from '../interfaces/ikaros-discussions-repository.interface';
import type { IUsersRepository } from '../../users/interfaces/users-repository.interface';
import type { DiscussionJoinRequestListItem } from '../interfaces/discussion-list-items.interface';

/**
 * Spec 3.4 §7.3 — provider pro Zpracovat tab (queue `discussion_join_request`).
 *
 * Na rozdíl od review/report providerů není gate per-role, ale **per-user**:
 * žádosti o přidání vidí jen manažer té konkrétní diskuze. `canHandle` proto
 * dělá DB lookup (interface to dovoluje — viz `IPendingActionProvider`).
 */
@Injectable()
export class DiscussionJoinProvider implements IPendingActionProvider<DiscussionJoinRequestListItem> {
  readonly type = PendingActionType.DiscussionJoinRequest;

  constructor(
    @Inject('IIkarosDiscussionsRepository')
    private readonly repo: IIkarosDiscussionsRepository,
    @Inject('IUsersRepository')
    private readonly usersRepo: IUsersRepository,
  ) {}

  async canHandle(userId: string): Promise<boolean> {
    const managed = await this.repo.findManagedWithJoinRequests(userId);
    return managed.length > 0;
  }

  async countForUser(userId: string): Promise<number> {
    const managed = await this.repo.findManagedWithJoinRequests(userId);
    return managed.reduce((sum, d) => sum + d.joinRequestIds.length, 0);
  }

  async listForUser(
    userId: string,
    _role: UserRole,
    page: number,
    limit: number,
  ): Promise<{ items: DiscussionJoinRequestListItem[]; total: number }> {
    const managed = await this.repo.findManagedWithJoinRequests(userId);
    // Zploštění (diskuze × žadatelé) na jeden seznam.
    const flat = managed.flatMap((d) =>
      d.joinRequestIds.map((requesterId) => ({
        discussionId: d.id,
        discussionTitle: d.title,
        userId: requesterId,
      })),
    );
    const total = flat.length;
    const offset = Math.max(0, (page - 1) * limit);
    const slice = flat.slice(offset, offset + limit);
    const items: DiscussionJoinRequestListItem[] = await Promise.all(
      slice.map(async (entry) => {
        const user = await this.usersRepo.findById(entry.userId);
        return {
          discussionId: entry.discussionId,
          discussionTitle: entry.discussionTitle,
          userId: entry.userId,
          username: user?.username ?? 'Neznámý uživatel',
        };
      }),
    );
    return { items, total };
  }
}

import { Injectable, Inject } from '@nestjs/common';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import type { IPagesRepository } from '../pages/interfaces/pages-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import { UserRole } from '../users/interfaces/user.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

interface AdminUser { id: string; role: UserRole }

@Injectable()
export class AdminService {
  constructor(
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
    @Inject('IPagesRepository') private readonly pagesRepo: IPagesRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
  ) {}

  async getUsers(opts: { username?: string; role?: UserRole; page: number; limit: number }) {
    return this.usersRepo.findAllPaginated(opts);
  }

  async updateUserRole(userId: string, role: UserRole) {
    return this.usersRepo.update(userId, { role });
  }

  async updateUserAkj(userId: string, akj: boolean) {
    return this.usersRepo.update(userId, { akj });
  }

  async getRecentPages(requester: AdminUser, limit: number) {
    if (requester.role <= UserRole.Admin) {
      return this.pagesRepo.findRecent(limit, undefined);
    }
    const memberships = await this.membershipRepo.findByUserId(requester.id);
    const pjWorldIds = memberships
      .filter((m) => m.role >= WorldRole.PJ)
      .map((m) => m.worldId);
    return this.pagesRepo.findRecent(limit, pjWorldIds);
  }
}

import { Injectable, Inject } from '@nestjs/common';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';

@Injectable()
export class PresenceService {
  private readonly thresholdMs: number;

  constructor(@Inject('IUsersRepository') private readonly usersRepo: IUsersRepository) {
    const hours = parseInt(process.env.PRESENCE_THRESHOLD_HOURS ?? '25', 10);
    this.thresholdMs = hours * 60 * 60 * 1000;
  }

  async getOnlineUserIds(): Promise<string[]> {
    const since = new Date(Date.now() - this.thresholdMs);
    return this.usersRepo.findOnlineSince(since);
  }
}

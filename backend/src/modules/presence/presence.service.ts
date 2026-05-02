import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';

@Injectable()
export class PresenceService {
  private readonly thresholdMs: number;

  constructor(
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
    private readonly configService: ConfigService,
  ) {
    const hours = this.configService.get<number>('PRESENCE_THRESHOLD_HOURS', 25);
    this.thresholdMs = hours * 60 * 60 * 1000;
  }

  async getOnlineUserIds(): Promise<string[]> {
    const since = new Date(Date.now() - this.thresholdMs);
    return this.usersRepo.findOnlineSince(since);
  }
}

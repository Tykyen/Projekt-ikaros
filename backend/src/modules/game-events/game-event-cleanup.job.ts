import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { IGameEventRepository } from './interfaces/game-event-repository.interface';
import { DAY_MS } from '../../common/constants/time.constants';

@Injectable()
export class GameEventCleanupJob {
  private readonly logger = new Logger(GameEventCleanupJob.name);

  constructor(
    @Inject('IGameEventRepository')
    private readonly gameEventRepo: IGameEventRepository,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async cleanup(): Promise<void> {
    const before = new Date(Date.now() - DAY_MS);
    try {
      const deleted = await this.gameEventRepo.deleteOlderThan(before);
      if (deleted > 0) {
        this.logger.log(
          `GameEventCleanup: smazáno ${deleted} starých událostí`,
        );
      }
    } catch (err) {
      this.logger.error('GameEventCleanup: chyba při mazání', err);
    }
  }
}

import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IWorldsRepository } from '../interfaces/worlds-repository.interface';
import { WorldHardDeleteService } from './world-hard-delete.service';
import { CronLockService } from '../../../common/locks/cron-lock.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Hard-delete soft-smazaných světů po vypršení 30denního recovery okna.
 * Vzor `AccountCleanupCron`. Běží denně 03:30 (po account cleanup).
 *
 * Pro každý expirovaný svět: cascade smazání všech dat (`WorldHardDeleteService`)
 * + emit `world.hardDeleted` (WS/audit). Po tomto je obnova nemožná.
 */
@Injectable()
export class WorldCleanupCron {
  private readonly logger = new Logger(WorldCleanupCron.name);
  static readonly RECOVERY_WINDOW_DAYS = 30;

  constructor(
    @Inject('IWorldsRepository') private readonly worldsRepo: IWorldsRepository,
    private readonly hardDelete: WorldHardDeleteService,
    private readonly events: EventEmitter2,
    private readonly cronLock: CronLockService,
  ) {}

  // CronLock — při 2+ replikách BE sweep proběhne jen na jedné instanci.
  @Cron('30 3 * * *', { name: 'world-hard-delete', timeZone: 'Europe/Prague' })
  async sweepCron(): Promise<void> {
    await this.cronLock.withLock('world-hard-delete', () => this.sweep());
  }

  async sweep(): Promise<void> {
    const cutoff = new Date(
      Date.now() - WorldCleanupCron.RECOVERY_WINDOW_DAYS * DAY_MS,
    );
    const expired = await this.worldsRepo.findExpiredDeleted(cutoff);
    if (expired.length === 0) {
      this.logger.debug('WorldCleanupCron.sweep — nic k hard-cleanup');
      return;
    }

    this.logger.log(
      `WorldCleanupCron — ${expired.length} světů po ${WorldCleanupCron.RECOVERY_WINDOW_DAYS}d → hard-delete`,
    );

    for (const w of expired) {
      try {
        await this.hardDelete.hardDelete(w.id);
        this.events.emit('world.hardDeleted', { worldId: w.id });
      } catch (err) {
        // Jeden selhaný svět nesmí zastavit zbytek dávky.
        this.logger.error(
          `Hard-delete světa ${w.id} selhal: ${(err as Error).message}`,
        );
      }
    }
  }
}

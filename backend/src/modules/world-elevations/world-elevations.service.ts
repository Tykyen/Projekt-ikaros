import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { IWorldElevationsRepository } from './interfaces/world-elevations-repository.interface';

/**
 * Payload eventu `world.elevation.changed` (admin audit listener ho zapisuje).
 * Emituje worlds.service (má requester username + world name pro audit).
 */
export interface WorldElevationChangedEvent {
  actorId: string;
  actorUsername: string;
  worldId: string;
  worldName: string;
  action: 'activated' | 'revoked';
}

/**
 * Elevation admin pravomocí ve světě (sudo / „nahození práv").
 * Spec: docs/arch/phase-1/_side-tasks/spec-world-admin-elevation.md.
 */
@Injectable()
export class WorldElevationsService {
  private readonly logger = new Logger(WorldElevationsService.name);

  constructor(
    @Inject('IWorldElevationsRepository')
    private readonly repo: IWorldElevationsRepository,
  ) {}

  /** Zapne elevaci admina pro daný svět (idempotentní). Audit emituje volající. */
  async activate(userId: string, worldId: string): Promise<void> {
    await this.repo.upsert(userId, worldId);
    this.logger.log(`Elevation ON — actor=${userId} world=${worldId}`);
  }

  /** Vypne elevaci admina pro daný svět. */
  async deactivate(userId: string, worldId: string): Promise<void> {
    await this.repo.delete(userId, worldId);
    this.logger.log(`Elevation OFF — actor=${userId} world=${worldId}`);
  }

  /** Světy, kde má uživatel aktivní elevaci — guard tím plní `elevatedWorldIds`. */
  async listWorldIdsForUser(userId: string): Promise<string[]> {
    return this.repo.listWorldIds(userId);
  }

  /** Je uživatel elevated v daném světě? */
  async isElevated(userId: string, worldId: string): Promise<boolean> {
    return this.repo.exists(userId, worldId);
  }

  /** Složí všechny elevace uživatele (volá logout). */
  async deactivateAllForUser(userId: string): Promise<void> {
    await this.repo.deleteAllForUser(userId);
  }

  /**
   * Hard-delete účtu uklidí i elevace (jinak orphan záznamy keyed na userId).
   * Konzistentní s trusted-devices cleanup (cascade-delete audit).
   */
  @OnEvent('user.deletion.hardDeleted')
  async handleAccountHardDeleted(payload: { userId: string }): Promise<void> {
    this.logger.log(
      `Account hard-deleted (userId=${payload.userId}) — ruším elevace.`,
    );
    await this.deactivateAllForUser(payload.userId);
  }
}

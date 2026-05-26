import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WorldCalendarConfigSchemaClass } from '../schemas/world-calendar-config.schema';
import type { IWorldCalendarConfigRepository } from '../interfaces/world-calendar-config-repository.interface';
import type {
  WorldCalendarConfig,
  CelestialBody,
  LeapYearRule,
  LunisolarRule,
  MonthDef,
  Season,
} from '../interfaces/world-calendar-config.interface';

@Injectable()
export class MongoWorldCalendarConfigRepository
  implements IWorldCalendarConfigRepository, OnModuleInit
{
  private readonly logger = new Logger(MongoWorldCalendarConfigRepository.name);

  constructor(
    @InjectModel(WorldCalendarConfigSchemaClass.name)
    private readonly model: Model<WorldCalendarConfigSchemaClass>,
  ) {}

  /**
   * 9.3-F-II FIX (2026-05-26) — Migration: drop legacy `worldId_1` unique index.
   *
   * Původní schema (commit 9b1a2339, May 2026) měl `worldId` jako unique field
   * (jeden config per svět). Multi-config refactor (9.2b, d5cf7841) změnil
   * unique na compound `{worldId, slug}`, ale Mongoose nedrop staré indexy.
   *
   * Bez tohoto dropu druhý create v jakémkoli světě selže s `E11000 duplicate key`
   * na legacy index → BE odpoví 409 SLUG_TAKEN i pro unikátní slug.
   *
   * Idempotent: pokud index neexistuje (čerstvá DB), tichý no-op.
   */
  async onModuleInit(): Promise<void> {
    try {
      const indexes = await this.model.collection.indexes();
      const legacy = indexes.find(
        (i) => i.name === 'worldId_1' && i.unique === true,
      );
      if (legacy) {
        await this.model.collection.dropIndex('worldId_1');
        this.logger.warn(
          '[MIGRATION 9.3-F-II] Dropped legacy `worldId_1` unique index from `world_calendar_configs` (multi-config refactor remnant).',
        );
      }
    } catch (err) {
      this.logger.error(
        `[MIGRATION 9.3-F-II] Failed to check/drop legacy index: ${(err as Error).message}`,
      );
    }
  }

  async findAllByWorldId(worldId: string): Promise<WorldCalendarConfig[]> {
    const docs = await this.model.find({ worldId }).lean().exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findBySlug(
    worldId: string,
    slug: string,
  ): Promise<WorldCalendarConfig | null> {
    const doc = await this.model.findOne({ worldId, slug }).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async create(
    worldId: string,
    data: Omit<
      WorldCalendarConfig,
      'id' | 'worldId' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<WorldCalendarConfig | null> {
    try {
      const doc = (await this.model.create({
        worldId,
        ...data,
      } as unknown as WorldCalendarConfigSchemaClass)) as unknown as {
        toObject: () => Record<string, unknown>;
      };
      return this.toEntity(doc.toObject());
    } catch (err: unknown) {
      // duplicate key (compound index worldId+slug)
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: number }).code === 11000
      ) {
        return null;
      }
      throw err;
    }
  }

  async patch(
    worldId: string,
    slug: string,
    data: Partial<
      Omit<
        WorldCalendarConfig,
        'id' | 'worldId' | 'slug' | 'createdAt' | 'updatedAt'
      >
    >,
  ): Promise<WorldCalendarConfig | null> {
    // Delta merge — $set jen ne-undefined fields (per feedback_persist_across_variants).
    const setOps: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) setOps[k] = v;
    }
    if (Object.keys(setOps).length === 0) {
      // No fields to update → just return current doc.
      return this.findBySlug(worldId, slug);
    }
    const doc = await this.model
      .findOneAndUpdate({ worldId, slug }, { $set: setOps }, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async remove(worldId: string, slug: string): Promise<boolean> {
    const res = await this.model.deleteOne({ worldId, slug }).exec();
    return res.deletedCount > 0;
  }

  private toEntity(doc: Record<string, unknown>): WorldCalendarConfig {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      slug: doc.slug as string,
      name: doc.name as string,
      hoursPerDay: (doc.hoursPerDay as number) ?? 24,
      daysOfWeek: (doc.daysOfWeek as string[]) ?? [],
      months: (doc.months as MonthDef[]) ?? [],
      celestialBodies: (doc.celestialBodies as CelestialBody[]) ?? [],
      seasons: (doc.seasons as Season[]) ?? [],
      leapYearRule: (doc.leapYearRule as LeapYearRule | null) ?? undefined,
      lunisolar: (doc.lunisolar as LunisolarRule | null) ?? undefined,
      epochOffset: (doc.epochOffset as number) ?? 0,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}

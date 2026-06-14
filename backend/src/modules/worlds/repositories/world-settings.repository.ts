import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WorldSettingsSchemaClass } from '../schemas/world-settings.schema';
import { WorldSettings } from '../interfaces/world-settings.interface';
import type { IWorldSettingsRepository } from '../interfaces/world-settings-repository.interface';

@Injectable()
export class MongoWorldSettingsRepository implements IWorldSettingsRepository {
  constructor(
    @InjectModel(WorldSettingsSchemaClass.name)
    private readonly model: Model<WorldSettingsSchemaClass>,
  ) {}

  async findByWorldId(worldId: string): Promise<WorldSettings | null> {
    const doc = await this.model.findOne({ worldId }).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async upsert(
    worldId: string,
    data: Partial<WorldSettings>,
  ): Promise<WorldSettings> {
    const update = { ...data, worldId, updatedAt: new Date() };
    const doc = await this.model
      .findOneAndUpdate(
        { worldId },
        { $set: update },
        { new: true, upsert: true },
      )
      .lean()
      .exec();
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  private toEntity(doc: Record<string, unknown>): WorldSettings {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      hiddenNavItems: (doc.hiddenNavItems as string[]) ?? [],
      customGroups: (doc.customGroups as string[]) ?? [],
      groupColors: (doc.groupColors as Record<string, string>) ?? {},
      groupImages: (doc.groupImages as Record<string, string>) ?? {},
      customHeadline:
        (doc.customHeadline as WorldSettings['customHeadline']) ?? [],
      currencies: (doc.currencies as WorldSettings['currencies']) ?? [],
      hideDefaultWeather: (doc.hideDefaultWeather as boolean) ?? false,
      akjTypes: (doc.akjTypes as WorldSettings['akjTypes']) ?? [],
      menuTemplates:
        (doc.menuTemplates as WorldSettings['menuTemplates']) ?? [],
      diarySchema: (doc.diarySchema as WorldSettings['diarySchema']) ?? [],
      characterTabVisibility:
        (doc.characterTabVisibility as WorldSettings['characterTabVisibility']) ??
        undefined,
      timelineCalendarSlug: (doc.timelineCalendarSlug as string | null) ?? null,
      lastInfo: (doc.lastInfo as WorldSettings['lastInfo']) ?? null,
      pjChatPersona: ((): WorldSettings['pjChatPersona'] => {
        const p = doc.pjChatPersona as
          | {
              enabled?: boolean;
              name?: string | null;
              avatarUrl?: string | null;
              mode?: 'unified' | 'individual';
            }
          | null
          | undefined;
        if (!p) return null;
        // 6.8-followup migrace: starý dokument bez `mode` → odvoď z `enabled`
        // (enabled:false historicky = neanonymní → 'individual'), jinak 'unified'.
        return {
          enabled: p.enabled ?? true,
          name: p.name ?? null,
          avatarUrl: p.avatarUrl ?? null,
          mode: p.mode ?? (p.enabled === false ? 'individual' : 'unified'),
        };
      })(),
      currentInGameDate: (doc.currentInGameDate as Date | null) ?? null,
      updatedAt: doc.updatedAt as Date,
    };
  }
}

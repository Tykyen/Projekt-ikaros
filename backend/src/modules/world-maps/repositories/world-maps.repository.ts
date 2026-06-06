import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WorldMapsSchemaClass } from '../schemas/world-maps.schema';
import type { WorldMapEntry } from '../interfaces/world-map.interface';
import type { IWorldMapsRepository } from '../interfaces/world-maps-repository.interface';

@Injectable()
export class MongoWorldMapsRepository implements IWorldMapsRepository {
  constructor(
    @InjectModel(WorldMapsSchemaClass.name)
    private readonly model: Model<WorldMapsSchemaClass>,
  ) {}

  async findByWorld(worldId: string): Promise<WorldMapEntry[]> {
    const doc = await this.model.findOne({ worldId }).lean().exec();
    if (!doc) return [];
    return (doc.maps ?? []).map((m) => this.toEntry(m));
  }

  async addMap(worldId: string, entry: WorldMapEntry): Promise<WorldMapEntry> {
    await this.model
      .findOneAndUpdate(
        { worldId },
        { $push: { maps: entry } },
        { new: true, upsert: true },
      )
      .lean()
      .exec();
    return entry;
  }

  async updateMap(
    worldId: string,
    mapId: string,
    patch: Partial<WorldMapEntry>,
  ): Promise<WorldMapEntry | null> {
    // Pozičním operátorem `$` updatujeme jen poskytnutá pole vybrané mapy.
    const set: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'id') continue;
      set[`maps.$.${key}`] = value;
    }
    if (Object.keys(set).length === 0) {
      const current = await this.findByWorld(worldId);
      return current.find((m) => m.id === mapId) ?? null;
    }
    const doc = await this.model
      .findOneAndUpdate(
        { worldId, 'maps.id': mapId },
        { $set: set },
        { new: true },
      )
      .lean()
      .exec();
    if (!doc) return null;
    const updated = (doc.maps ?? []).find((m) => m['id'] === mapId);
    return updated ? this.toEntry(updated) : null;
  }

  async removeMap(worldId: string, mapId: string): Promise<boolean> {
    const res = await this.model
      .updateOne({ worldId }, { $pull: { maps: { id: mapId } } })
      .exec();
    return res.modifiedCount > 0;
  }

  async reorder(
    worldId: string,
    orderedIds: string[],
  ): Promise<WorldMapEntry[]> {
    const maps = await this.findByWorld(worldId);
    const rank = new Map(orderedIds.map((id, i) => [id, i]));
    const reordered = maps
      .map((m) => ({ ...m, order: rank.get(m.id) ?? m.order }))
      .sort((a, b) => a.order - b.order);
    await this.model
      .findOneAndUpdate({ worldId }, { $set: { maps: reordered } })
      .exec();
    return reordered;
  }

  private toEntry(m: Record<string, unknown>): WorldMapEntry {
    return {
      id: m['id'] as string,
      title: (m['title'] as string) ?? '',
      description: (m['description'] as string) ?? '',
      imageUrl: (m['imageUrl'] as string) ?? '',
      order: (m['order'] as number) ?? 0,
      isPublic: (m['isPublic'] as boolean) ?? false,
      visibleToPlayerIds: (m['visibleToPlayerIds'] as string[]) ?? [],
      createdAt: (m['createdAt'] as string) ?? '',
      updatedAt: (m['updatedAt'] as string) ?? '',
    };
  }
}

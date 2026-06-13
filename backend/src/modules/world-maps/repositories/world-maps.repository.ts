import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WorldMapEntrySchemaClass } from '../schemas/world-map-entry.schema';
import type { WorldMapEntry } from '../interfaces/world-map.interface';
import type { IWorldMapsRepository } from '../interfaces/world-maps-repository.interface';

/**
 * 13.4b — Mapy 2.0: jedna mapa = jeden dokument v kolekci `worldMapEntries`
 * (refaktor z embedded `worldMaps[]` kvůli škále 500+). Rozhraní
 * `IWorldMapsRepository` zachováno → service/controller netknuté.
 */
@Injectable()
export class MongoWorldMapsRepository implements IWorldMapsRepository {
  constructor(
    @InjectModel(WorldMapEntrySchemaClass.name)
    private readonly model: Model<WorldMapEntrySchemaClass>,
  ) {}

  async findByWorld(worldId: string): Promise<WorldMapEntry[]> {
    const docs = await this.model
      .find({ worldId })
      .sort({ order: 1 })
      .lean()
      .exec();
    return docs.map((d) => this.toEntry(d));
  }

  async addMap(worldId: string, entry: WorldMapEntry): Promise<WorldMapEntry> {
    await this.model.create({ ...entry, worldId });
    return entry;
  }

  async updateMap(
    worldId: string,
    mapId: string,
    patch: Partial<WorldMapEntry>,
  ): Promise<WorldMapEntry | null> {
    const set: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'id') continue;
      set[key] = value;
    }
    if (Object.keys(set).length === 0) {
      const doc = await this.model
        .findOne({ worldId, id: mapId })
        .lean()
        .exec();
      return doc ? this.toEntry(doc) : null;
    }
    const doc = await this.model
      .findOneAndUpdate({ worldId, id: mapId }, { $set: set }, { new: true })
      .lean()
      .exec();
    return doc ? this.toEntry(doc) : null;
  }

  async removeMap(worldId: string, mapId: string): Promise<boolean> {
    const res = await this.model.deleteOne({ worldId, id: mapId }).exec();
    return res.deletedCount > 0;
  }

  async reorder(
    worldId: string,
    orderedIds: string[],
  ): Promise<WorldMapEntry[]> {
    const ops = orderedIds.map((id, i) => ({
      updateOne: {
        filter: { worldId, id },
        update: { $set: { order: i } },
      },
    }));
    if (ops.length > 0) await this.model.bulkWrite(ops);
    return this.findByWorld(worldId);
  }

  async reparentMaps(
    worldId: string,
    fromFolderId: string,
    toFolderId: string | null,
  ): Promise<void> {
    await this.model
      .updateMany(
        { worldId, folderId: fromFolderId },
        { $set: { folderId: toFolderId } },
      )
      .exec();
  }

  private toEntry(d: WorldMapEntrySchemaClass): WorldMapEntry {
    return {
      id: d.id,
      folderId: d.folderId ?? null,
      title: d.title ?? '',
      description: d.description ?? '',
      imageUrl: d.imageUrl ?? '',
      order: d.order ?? 0,
      isPublic: d.isPublic ?? false,
      visibleToPlayerIds: d.visibleToPlayerIds ?? [],
      createdAt: d.createdAt ?? '',
      updatedAt: d.updatedAt ?? '',
    };
  }
}

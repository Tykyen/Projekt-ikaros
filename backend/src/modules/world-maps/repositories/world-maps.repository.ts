import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  WorldMapEntrySchemaClass,
  WorldMapPinSchemaClass,
} from '../schemas/world-map-entry.schema';
import type {
  WorldMapEntry,
  WorldMapPin,
} from '../interfaces/world-map.interface';
import type { IWorldMapsRepository } from '../interfaces/world-maps-repository.interface';

/**
 * 13.4b — Mapy 2.0: jedna mapa = jeden dokument v kolekci `worldMapEntries`
 * (refaktor z embedded `worldMaps[]` kvůli škále 500+). Rozhraní
 * `IWorldMapsRepository` zachováno → service/controller netknuté.
 *
 * 16.5 — vlaječky (`pins[]`) = embedded sub-doc; granulární ops
 * (`$push`/`arrayFilters`/`$pull`) → přidání/přesun/smazání jednoho pinu
 * neposílá celé pole (race-safe i při ~100 pinech).
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

  // ── Vlaječky (16.5) ────────────────────────────────────────────────────────

  async addPin(
    worldId: string,
    mapId: string,
    pin: WorldMapPin,
    updatedAt: string,
  ): Promise<WorldMapEntry | null> {
    const doc = await this.model
      .findOneAndUpdate(
        { worldId, id: mapId },
        { $push: { pins: pin }, $set: { updatedAt } },
        { new: true },
      )
      .lean()
      .exec();
    return doc ? this.toEntry(doc) : null;
  }

  async updatePin(
    worldId: string,
    mapId: string,
    pinId: string,
    patch: Partial<WorldMapPin>,
    updatedAt: string,
  ): Promise<WorldMapEntry | null> {
    const set: Record<string, unknown> = { updatedAt };
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'id') continue;
      set[`pins.$[p].${key}`] = value;
    }
    const doc = await this.model
      .findOneAndUpdate(
        { worldId, id: mapId },
        { $set: set },
        { new: true, arrayFilters: [{ 'p.id': pinId }] },
      )
      .lean()
      .exec();
    return doc ? this.toEntry(doc) : null;
  }

  async removePin(
    worldId: string,
    mapId: string,
    pinId: string,
    updatedAt: string,
  ): Promise<WorldMapEntry | null> {
    const doc = await this.model
      .findOneAndUpdate(
        { worldId, id: mapId },
        { $pull: { pins: { id: pinId } }, $set: { updatedAt } },
        { new: true },
      )
      .lean()
      .exec();
    return doc ? this.toEntry(doc) : null;
  }

  private toPin(p: WorldMapPinSchemaClass): WorldMapPin {
    return {
      id: p.id,
      x: p.x ?? 0,
      y: p.y ?? 0,
      label: p.label ?? '',
      info: p.info ?? '',
      targetType: (p.targetType as WorldMapPin['targetType']) ?? 'none',
      targetSlug: p.targetSlug ?? null,
      targetMapId: p.targetMapId ?? null,
      icon: p.icon ?? 'marker',
      color: p.color ?? 'cyan',
      isPublic: p.isPublic ?? true,
      visibleToPlayerIds: p.visibleToPlayerIds ?? [],
    };
  }

  private toEntry(d: WorldMapEntrySchemaClass): WorldMapEntry {
    return {
      id: d.id,
      folderId: d.folderId ?? null,
      title: d.title ?? '',
      description: d.description ?? '',
      imageUrl: d.imageUrl ?? '',
      // D-19.2 — velikost blobu; staré dokumenty undefined.
      imageBytes: d.imageBytes,
      order: d.order ?? 0,
      isPublic: d.isPublic ?? false,
      visibleToPlayerIds: d.visibleToPlayerIds ?? [],
      pins: (d.pins ?? []).map((p) => this.toPin(p)),
      linkedSceneId: d.linkedSceneId ?? null,
      createdAt: d.createdAt ?? '',
      updatedAt: d.updatedAt ?? '',
    };
  }
}

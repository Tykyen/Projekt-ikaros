import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { DungeonMapSchemaClass } from '../schemas/dungeon-map.schema';
import type {
  DungeonMap,
  DungeonCell,
  DungeonDecoration,
} from '../interfaces/dungeon-map.interface';
import {
  MAP_KINDS,
  GRID_TYPES,
  DUNGEON_THEMES,
  pickEnum,
} from '../interfaces/dungeon-map.interface';
import type { IDungeonMapsRepository } from '../interfaces/dungeon-maps-repository.interface';

@Injectable()
export class MongoDungeonMapsRepository
  extends BaseMongoRepository<DungeonMap>
  implements IDungeonMapsRepository
{
  constructor(
    @InjectModel(DungeonMapSchemaClass.name)
    model: Model<DungeonMapSchemaClass>,
  ) {
    super(model as never);
  }

  async findByWorld(worldId: string, ownerId?: string): Promise<DungeonMap[]> {
    const filter: Record<string, unknown> = { worldId };
    if (ownerId !== undefined) filter.ownerId = ownerId;
    const docs = await this.model.find(filter).lean().exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findLibrary(ownerId: string): Promise<DungeonMap[]> {
    // { worldId: null } matchuje null i chybějící pole (Mongo semantika) —
    // library položky worldId nemají, world dokumenty ho mají vždy.
    const docs = await this.model
      .find({ ownerId, worldId: null })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async deleteLibraryByOwner(ownerId: string): Promise<number> {
    const result = await this.model
      .deleteMany({ ownerId, worldId: null })
      .exec();
    return result.deletedCount ?? 0;
  }

  async findById(id: string): Promise<DungeonMap | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model.findById(id).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async create(data: Partial<DungeonMap>): Promise<DungeonMap> {
    const doc = await this.model.create({ ...data, lastModified: new Date() });
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async replace(
    id: string,
    data: Partial<DungeonMap>,
  ): Promise<DungeonMap | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(
        id,
        { ...data, lastModified: new Date() },
        { new: true, overwrite: true },
      )
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }

  protected toEntity(doc: Record<string, unknown>): DungeonMap {
    return {
      id: String(doc._id),
      // 21.3c — library položky worldId nemají; normalizuj na null.
      worldId: (doc.worldId as string | undefined) ?? null,
      ownerId: doc.ownerId as string | undefined,
      name: (doc.name as string) ?? '',
      // D-077 — whitelist, NE ternár: binární `=== 'city' ? … : 'dungeon'`
      // shodil `'wilderness'` do else větve a `replace()` (overwrite) tu
      // zkolabovanou hodnotu zapsal zpět → krajina se tiše měnila na podzemí.
      // Legacy dokument bez pole → fallback (viz komentář u MAP_KINDS).
      mapKind:
        doc.mapKind === undefined
          ? undefined
          : pickEnum(MAP_KINDS, doc.mapKind, 'dungeon'),
      gridType: pickEnum(GRID_TYPES, doc.gridType, 'square'),
      gridWidth: (doc.gridWidth as number) ?? 20,
      gridHeight: (doc.gridHeight as number) ?? 20,
      cellSize: (doc.cellSize as number) ?? 40,
      theme: pickEnum(DUNGEON_THEMES, doc.theme, 'dyson'),
      cells: (doc.cells as DungeonCell[][]) ?? [],
      decorations: (doc.decorations as DungeonDecoration[]) ?? [],
      notes: (doc.notes as DungeonMap['notes']) ?? [],
      lastModified: doc.lastModified as Date | undefined,
    };
  }
}

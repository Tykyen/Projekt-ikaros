import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WorldMapFolderSchemaClass } from '../schemas/world-map-folder.schema';
import type { WorldMapFolder } from '../interfaces/world-map-folder.interface';
import type { IWorldMapFoldersRepository } from '../interfaces/world-map-folders-repository.interface';

/** 13.4b F2 — složky atlasu (kolekce `worldMapFolders`, 1 dok = 1 složka). */
@Injectable()
export class MongoWorldMapFoldersRepository implements IWorldMapFoldersRepository {
  constructor(
    @InjectModel(WorldMapFolderSchemaClass.name)
    private readonly model: Model<WorldMapFolderSchemaClass>,
  ) {}

  async findByWorld(worldId: string): Promise<WorldMapFolder[]> {
    const docs = await this.model
      .find({ worldId })
      .sort({ order: 1 })
      .lean()
      .exec();
    return docs.map((d) => this.toFolder(d));
  }

  async create(
    worldId: string,
    folder: WorldMapFolder,
  ): Promise<WorldMapFolder> {
    await this.model.create({ ...folder, worldId });
    return folder;
  }

  async update(
    worldId: string,
    folderId: string,
    patch: Partial<WorldMapFolder>,
  ): Promise<WorldMapFolder | null> {
    const set: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'id') continue;
      set[key] = value;
    }
    if (Object.keys(set).length === 0) {
      const doc = await this.model
        .findOne({ worldId, id: folderId })
        .lean()
        .exec();
      return doc ? this.toFolder(doc) : null;
    }
    const doc = await this.model
      .findOneAndUpdate({ worldId, id: folderId }, { $set: set }, { new: true })
      .lean()
      .exec();
    return doc ? this.toFolder(doc) : null;
  }

  async remove(worldId: string, folderId: string): Promise<boolean> {
    const res = await this.model.deleteOne({ worldId, id: folderId }).exec();
    return res.deletedCount > 0;
  }

  async reorder(
    worldId: string,
    orderedIds: string[],
  ): Promise<WorldMapFolder[]> {
    const ops = orderedIds.map((id, i) => ({
      updateOne: {
        filter: { worldId, id },
        update: { $set: { order: i } },
      },
    }));
    if (ops.length > 0) await this.model.bulkWrite(ops);
    return this.findByWorld(worldId);
  }

  async reparentChildren(
    worldId: string,
    fromParentId: string,
    toParentId: string | null,
  ): Promise<void> {
    await this.model
      .updateMany(
        { worldId, parentId: fromParentId },
        { $set: { parentId: toParentId } },
      )
      .exec();
  }

  private toFolder(d: WorldMapFolderSchemaClass): WorldMapFolder {
    return {
      id: d.id,
      parentId: d.parentId ?? null,
      name: d.name ?? '',
      order: d.order ?? 0,
      isPublic: d.isPublic ?? false,
      visibleToPlayerIds: d.visibleToPlayerIds ?? [],
      createdAt: d.createdAt ?? '',
      updatedAt: d.updatedAt ?? '',
    };
  }
}

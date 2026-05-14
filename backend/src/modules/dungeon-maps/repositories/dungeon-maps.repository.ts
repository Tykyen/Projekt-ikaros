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

  async findByWorld(worldId: string): Promise<DungeonMap[]> {
    const docs = await this.model.find({ worldId }).lean().exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
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
      worldId: doc.worldId as string,
      name: (doc.name as string) ?? '',
      gridType: (doc.gridType as string) === 'hex' ? 'hex' : 'square',
      gridWidth: (doc.gridWidth as number) ?? 20,
      gridHeight: (doc.gridHeight as number) ?? 20,
      cellSize: (doc.cellSize as number) ?? 40,
      theme: (doc.theme as string) === 'modern' ? 'modern' : 'dyson',
      cells: (doc.cells as DungeonCell[][]) ?? [],
      decorations: (doc.decorations as DungeonDecoration[]) ?? [],
      lastModified: doc.lastModified as Date | undefined,
    };
  }
}

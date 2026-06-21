import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { WorldPageTemplateSchemaClass } from '../schemas/world-page-template.schema';
import type { WorldPageTemplate } from '../interfaces/world-page-template.interface';
import type { IWorldPageTemplatesRepository } from '../interfaces/world-page-templates-repository.interface';

@Injectable()
export class MongoWorldPageTemplatesRepository
  extends BaseMongoRepository<WorldPageTemplate>
  implements IWorldPageTemplatesRepository
{
  constructor(
    @InjectModel(WorldPageTemplateSchemaClass.name)
    model: Model<WorldPageTemplateSchemaClass>,
  ) {
    super(model as never);
  }

  async findByWorld(worldId: string): Promise<WorldPageTemplate[]> {
    const docs = await this.model
      .find({ worldId })
      .sort({ order: 1, createdAt: 1 })
      .lean()
      .exec();
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  async existsByKey(worldId: string, key: string): Promise<boolean> {
    const count = await this.model.countDocuments({ worldId, key }).exec();
    return count > 0;
  }

  protected toEntity(doc: Record<string, unknown>): WorldPageTemplate {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      key: doc.key as string,
      label: doc.label as string,
      headers: (doc.headers as string[]) ?? [],
      defaultTitle: doc.defaultTitle as string | undefined,
      contentOutline: doc.contentOutline as string | undefined,
      icon: doc.icon as string | undefined,
      order: (doc.order as number) ?? 0,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}

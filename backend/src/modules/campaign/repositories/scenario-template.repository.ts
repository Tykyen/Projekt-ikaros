import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { ScenarioTemplateSchemaClass } from '../schemas/scenario-template.schema';
import type { ScenarioTemplate } from '../interfaces/scenario-template.interface';
import type { IScenarioTemplateRepository } from '../interfaces/scenario-template-repository.interface';

@Injectable()
export class MongoScenarioTemplateRepository
  extends BaseMongoRepository<ScenarioTemplate>
  implements IScenarioTemplateRepository
{
  constructor(
    @InjectModel(ScenarioTemplateSchemaClass.name)
    model: Model<ScenarioTemplateSchemaClass>,
  ) {
    super(model as never);
  }

  async findAll(): Promise<ScenarioTemplate[]> {
    const docs = await this.model.find().sort({ updatedAt: -1 }).lean().exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findByOwner(ownerId: string): Promise<ScenarioTemplate[]> {
    const docs = await this.model
      .find({ ownerId })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findById(id: string): Promise<ScenarioTemplate | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model.findById(id).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async create(data: Partial<ScenarioTemplate>): Promise<ScenarioTemplate> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }

  protected toEntity(doc: Record<string, unknown>): ScenarioTemplate {
    return {
      id: String(doc._id),
      ownerId: (doc.ownerId as string) ?? '',
      name: (doc.name as string) ?? '',
      scenarioTitle: (doc.scenarioTitle as string) ?? '',
      contentData: (doc.contentData as Record<string, unknown>) ?? {},
      createdAt: doc.createdAt as Date | undefined,
      updatedAt: doc.updatedAt as Date | undefined,
    };
  }
}

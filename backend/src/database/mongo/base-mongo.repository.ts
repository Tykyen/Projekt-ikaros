import { Model, Types } from 'mongoose';
import { IBaseRepository } from '../../common/interfaces/base-repository.interface';

export abstract class BaseMongoRepository<T> implements IBaseRepository<T> {
  constructor(protected readonly model: Model<T & { _id: Types.ObjectId }>) {}

  async findById(id: string): Promise<T | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model.findById(id).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findAll(filter: Record<string, unknown> = {}): Promise<T[]> {
    const docs = await this.model.find(filter).lean().exec();
    return docs.map((doc) => this.toEntity(doc));
  }

  async save(entity: Partial<T>): Promise<T> {
    const created = new this.model(entity);
    const saved = await created.save();
    return this.toEntity(saved.toObject());
  }

  async update(id: string, entity: Partial<T>): Promise<T | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: entity as Record<string, unknown> }, { new: true })
      .lean()
      .exec();
    return doc ? this.toEntity(doc) : null;
  }

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }

  protected abstract toEntity(doc: Record<string, unknown>): T;
}

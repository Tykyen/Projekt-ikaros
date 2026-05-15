import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { IGalleryCategoriesRepository } from '../interfaces/gallery-categories-repository.interface';
import type { GalleryCategory } from '../interfaces/gallery-category.interface';
import { GalleryCategorySchemaClass } from '../schemas/gallery-category.schema';

@Injectable()
export class MongoGalleryCategoriesRepository implements IGalleryCategoriesRepository {
  constructor(
    @InjectModel(GalleryCategorySchemaClass.name)
    private readonly model: Model<GalleryCategorySchemaClass>,
  ) {}

  private toEntity(doc: Record<string, unknown>): GalleryCategory {
    return {
      key: doc.key as string,
      label: doc.label as string,
      color: doc.color as string,
      order: doc.order as number,
      createdAtUtc: doc.createdAtUtc as Date,
    };
  }

  async findAll(): Promise<GalleryCategory[]> {
    const docs = await this.model.find().sort({ order: 1 }).lean().exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findByKey(key: string): Promise<GalleryCategory | null> {
    const doc = await this.model.findOne({ key }).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async create(
    data: Omit<GalleryCategory, 'createdAtUtc'>,
  ): Promise<GalleryCategory> {
    const doc = await this.model.create({ ...data, createdAtUtc: new Date() });
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(
    key: string,
    patch: Partial<Omit<GalleryCategory, 'key' | 'createdAtUtc'>>,
  ): Promise<GalleryCategory | null> {
    const doc = await this.model
      .findOneAndUpdate({ key }, patch, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async delete(key: string): Promise<boolean> {
    const result = await this.model.findOneAndDelete({ key }).lean().exec();
    return result !== null;
  }
}

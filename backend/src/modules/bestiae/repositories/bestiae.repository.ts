/**
 * 10.2d-prep-B — Bestiae repository (Mongo atomic ops).
 */
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BestieDocument, BestieSchemaClass } from '../schemas/bestie.schema';
import type { Bestie } from '../interfaces/bestie.interface';

interface VisibilityFilter {
  systemId: string;
  userId: string;
  worldId?: string;
}

@Injectable()
export class BestiaeRepository {
  constructor(
    @InjectModel(BestieSchemaClass.name)
    private readonly model: Model<BestieDocument>,
  ) {}

  private toEntity(doc: BestieDocument | null): Bestie | null {
    if (!doc) return null;
    const o = doc.toObject() as unknown as Record<string, unknown> & {
      _id: unknown;
    };
    return {
      id: String(o._id),
      scope: o.scope as Bestie['scope'],
      systemId: o.systemId as string,
      ownerUserId: o.ownerUserId as string | undefined,
      worldId: o.worldId as string | undefined,
      name: o.name as string,
      imageUrl: o.imageUrl as string | undefined,
      imageFocalX: (o.imageFocalX as number | null) ?? null,
      imageFocalY: (o.imageFocalY as number | null) ?? null,
      imageZoom: (o.imageZoom as number | null) ?? null,
      imageFit: (o.imageFit as Bestie['imageFit']) ?? null,
      notes: (o.notes as string) ?? '',
      description: (o.description as string) ?? '',
      systemStats: (o.systemStats as Record<string, unknown>) ?? {},
      clonedFromId: o.clonedFromId as string | undefined,
      deletedAt: o.deletedAt as Date | null,
      createdAt: o.createdAt as Date,
      updatedAt: o.updatedAt as Date,
    };
  }

  async findVisible(filter: VisibilityFilter): Promise<Bestie[]> {
    const orConditions: Record<string, unknown>[] = [
      { scope: 'system' },
      { scope: 'user', ownerUserId: filter.userId },
    ];
    if (filter.worldId) {
      orConditions.push({ scope: 'world', worldId: filter.worldId });
    }
    const docs = await this.model
      .find({
        systemId: filter.systemId,
        deletedAt: null,
        $or: orConditions,
      })
      .sort({ name: 1 })
      .exec();
    return docs.map((d) => this.toEntity(d)!).filter(Boolean);
  }

  async findById(id: string): Promise<Bestie | null> {
    const doc = await this.model.findById(id).exec();
    return this.toEntity(doc);
  }

  async create(data: Partial<Bestie>): Promise<Bestie> {
    const doc = await this.model.create(data);
    return this.toEntity(doc)!;
  }

  async updateAtomic(
    id: string,
    patch: Partial<Bestie>,
  ): Promise<Bestie | null> {
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: patch }, { new: true })
      .exec();
    return this.toEntity(doc);
  }

  async softDelete(id: string): Promise<void> {
    await this.model
      .findByIdAndUpdate(id, { $set: { deletedAt: new Date() } })
      .exec();
  }

  async hardDelete(id: string): Promise<void> {
    await this.model.findByIdAndDelete(id).exec();
  }

  async restore(id: string): Promise<Bestie | null> {
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: { deletedAt: null } }, { new: true })
      .exec();
    return this.toEntity(doc);
  }

  /**
   * FIX-4 (BE oprava dávka, 2026-07) — `scope:'user'` bestie (per-PJ šablony
   * napříč světy, `ownerUserId` je jediné vlastnické pole u tohoto scope)
   * nejsou keyed `worldId` → chybí ve world-hard-delete cascade. Před jejich
   * smazáním posbírá `imageUrl`, aby volající mohl uklidit Cloudinary blob.
   */
  async findImageUrlsByOwner(userId: string): Promise<string[]> {
    const docs = await this.model
      .find(
        { scope: 'user', ownerUserId: userId, imageUrl: { $ne: null } },
        { imageUrl: 1 },
      )
      .lean()
      .exec();
    return docs
      .map((d) => (d as unknown as { imageUrl?: string }).imageUrl)
      .filter(
        (url): url is string => typeof url === 'string' && url.length > 0,
      );
  }

  /** FIX-4 — hard cleanup: smaže všechny `scope:'user'` bestie daného ownera. */
  async deleteAllByOwner(userId: string): Promise<void> {
    await this.model.deleteMany({ scope: 'user', ownerUserId: userId }).exec();
  }
}

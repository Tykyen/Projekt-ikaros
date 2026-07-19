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
      // D-19.2 — velikost blobu; staré dokumenty undefined.
      imageBytes: o.imageBytes as number | undefined,
      imageFocalX: (o.imageFocalX as number | null) ?? null,
      imageFocalY: (o.imageFocalY as number | null) ?? null,
      imageZoom: (o.imageZoom as number | null) ?? null,
      imageFit: (o.imageFit as Bestie['imageFit']) ?? null,
      notes: (o.notes as string) ?? '',
      description: (o.description as string) ?? '',
      systemStats: (o.systemStats as Record<string, unknown>) ?? {},
      clonedFromId: o.clonedFromId as string | undefined,
      deletedAt: o.deletedAt as Date | null,
      moderationHidden: (o.moderationHidden as boolean | undefined) ?? false,
      moderationHiddenReason: o.moderationHiddenReason as string | undefined,
      createdAt: o.createdAt as Date,
      updatedAt: o.updatedAt as Date,
      // 16.2b-2 — komunitní scope (u ostatních scope undefined).
      latin: o.latin as string | undefined,
      kind: o.kind as string | undefined,
      tags: o.tags as string[] | undefined,
      status: o.status as Bestie['status'],
      authorId: o.authorId as string | undefined,
      approvedAt: (o.approvedAt as Date | null) ?? null,
      approvedBy: o.approvedBy as string | undefined,
      statblocks: o.statblocks as Bestie['statblocks'],
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
        // B5 — moderačně skryté bestie (M2/M3) z listů vždy vynech.
        moderationHidden: { $ne: true },
        $or: orConditions,
      })
      // D-NAMESORT — řadicí klíč (fold z `name`) místo binárního `name`.
      .sort({ nameSort: 1 })
      .exec();
    return docs.map((d) => this.toEntity(d)!).filter(Boolean);
  }

  /**
   * 16.2b-2 — komunitní (globální) bestie, cross-system. Dvě knihovny přes
   * `status` (approved / draft). Filtr `kind` (typ) a `systemId` (bytosti, co
   * mají pravidlovou verzi pro daný systém). Moderačně skryté vždy vynech.
   */
  async findCommunity(filter: {
    status?: 'draft' | 'approved';
    kind?: string;
    systemId?: string;
    skip?: number;
    limit?: number;
  }): Promise<Bestie[]> {
    const q = this.communityQuery(filter);
    // D-NAMESORT — řadicí klíč (fold z `name`) místo binárního `name`.
    let query = this.model.find(q).sort({ nameSort: 1, _id: 1 });
    if (filter.skip) query = query.skip(filter.skip);
    if (filter.limit) query = query.limit(filter.limit);
    const docs = await query.exec();
    return docs.map((d) => this.toEntity(d)!).filter(Boolean);
  }

  /**
   * D-SEC-GAP-2026-07-11 — anti-abuse creation-flood: počet world-scope bestií
   * světa (vč. soft-deleted — bloat je bloat). Index { scope, worldId, systemId }.
   */
  async countByWorldId(worldId: string): Promise<number> {
    return this.model.countDocuments({ scope: 'world', worldId }).exec();
  }

  /** D-SEC-GAP-2026-07-11 — počet user-scope bestií účtu (vč. soft-deleted). */
  async countByOwner(userId: string): Promise<number> {
    return this.model
      .countDocuments({ scope: 'user', ownerUserId: userId })
      .exec();
  }

  /** 16.2b-2 — počet komunitních bytostí (pro pending badge). */
  async countCommunity(filter: {
    status?: 'draft' | 'approved';
    kind?: string;
    systemId?: string;
  }): Promise<number> {
    return this.model.countDocuments(this.communityQuery(filter)).exec();
  }

  private communityQuery(filter: {
    status?: 'draft' | 'approved';
    kind?: string;
    systemId?: string;
  }): Record<string, unknown> {
    const q: Record<string, unknown> = {
      scope: 'community',
      deletedAt: null,
      moderationHidden: { $ne: true },
    };
    if (filter.status) q.status = filter.status;
    if (filter.kind) q.kind = filter.kind;
    if (filter.systemId) q[`statblocks.${filter.systemId}`] = { $exists: true };
    return q;
  }

  /** 16.2b-2 — zapíše/přepíše celou pravidlovou verzi (statblok) pro systém. */
  async setStatblock(
    id: string,
    systemId: string,
    entry: NonNullable<Bestie['statblocks']>[string],
  ): Promise<Bestie | null> {
    const doc = await this.model
      .findByIdAndUpdate(
        id,
        { $set: { [`statblocks.${systemId}`]: entry } },
        { new: true },
      )
      .exec();
    return this.toEntity(doc);
  }

  /** 16.2b-2 — schválení jedné pravidlové verze (draft → approved). */
  async setStatblockStatus(
    id: string,
    systemId: string,
    status: 'draft' | 'approved',
  ): Promise<Bestie | null> {
    const doc = await this.model
      .findByIdAndUpdate(
        id,
        { $set: { [`statblocks.${systemId}.status`]: status } },
        { new: true },
      )
      .exec();
    return this.toEntity(doc);
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

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type ClientSession } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { WorldMembershipSchemaClass } from '../schemas/world-membership.schema';
import {
  WorldMembership,
  WorldThemeAdjust,
} from '../interfaces/world-membership.interface';
import type { IWorldMembershipRepository } from '../interfaces/world-membership-repository.interface';

@Injectable()
export class MongoWorldMembershipRepository
  extends BaseMongoRepository<WorldMembership>
  implements IWorldMembershipRepository
{
  constructor(
    @InjectModel(WorldMembershipSchemaClass.name)
    model: Model<WorldMembershipSchemaClass>,
  ) {
    super(model as never);
  }

  async findByWorldId(
    worldId: string,
    filters?: { role?: number; group?: string },
  ): Promise<WorldMembership[]> {
    const query: Record<string, unknown> = { worldId };
    if (filters?.role !== undefined) query.role = filters.role;
    if (filters?.group !== undefined) query.group = filters.group;
    const docs = await this.model.find(query).lean().exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findByUserId(userId: string): Promise<WorldMembership[]> {
    const docs = await this.model.find({ userId }).lean().exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findByUserAndWorld(
    userId: string,
    worldId: string,
  ): Promise<WorldMembership | null> {
    const doc = await this.model.findOne({ userId, worldId }).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  /**
   * D-NEW-chat-mention-character — lookup membera ve světě podle slugu jeho
   * postavy. Umožňuje mention `@<character-slug>` v chatu → resolve na userId.
   */
  async findByCharacterPathAndWorld(
    worldId: string,
    characterPath: string,
  ): Promise<WorldMembership | null> {
    const doc = await this.model
      .findOne({ worldId, characterPath })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  /**
   * D-NEW-chat-mention-character — batch verze: pro pole slugů vrátí membership
   * záznamy ve světě (1 query). Použito v chat.service pro resolve mentions.
   */
  async findByCharacterPathsAndWorld(
    worldId: string,
    characterPaths: string[],
  ): Promise<WorldMembership[]> {
    if (characterPaths.length === 0) return [];
    const docs = await this.model
      .find({ worldId, characterPath: { $in: characterPaths } })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async countByWorldId(worldId: string): Promise<number> {
    return this.model.countDocuments({ worldId }).exec();
  }

  async countByUserId(userId: string): Promise<number> {
    return this.model.countDocuments({ userId }).exec();
  }

  async countsByUserIds(userIds: string[]): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const rows = (await this.model
      .aggregate([
        { $match: { userId: { $in: userIds } } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
      ])
      .exec()) as Array<{ _id: string; count: number }>;
    const map = new Map<string, number>();
    for (const r of rows) map.set(r._id, r.count);
    for (const uid of userIds) if (!map.has(uid)) map.set(uid, 0);
    return map;
  }

  async countByRoleAcrossWorlds(
    role: number,
    worldIds: string[] | undefined,
  ): Promise<number> {
    if (worldIds && worldIds.length === 0) return 0;
    const query: Record<string, unknown> = { role };
    if (worldIds !== undefined) query.worldId = { $in: worldIds };
    return this.model.countDocuments(query).exec();
  }

  async findPaginatedByRoleAcrossWorlds(
    role: number,
    worldIds: string[] | undefined,
    page: number,
    limit: number,
  ): Promise<{ items: WorldMembership[]; total: number }> {
    if (worldIds && worldIds.length === 0) return { items: [], total: 0 };
    const query: Record<string, unknown> = { role };
    if (worldIds !== undefined) query.worldId = { $in: worldIds };
    const total = await this.model.countDocuments(query).exec();
    const docs = await this.model
      .find(query)
      .sort({ joinedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
      .exec();
    return {
      items: docs.map((d) =>
        this.toEntity(d as unknown as Record<string, unknown>),
      ),
      total,
    };
  }

  /**
   * D-061 — override base save s podporou Mongo session pro `withTransaction`
   * scope. Bez session = standardní save.
   */
  async save(
    entity: Partial<WorldMembership>,
    session?: ClientSession,
  ): Promise<WorldMembership> {
    const created = new this.model(entity);
    const saved = await created.save(session ? { session } : undefined);
    return this.toEntity(
      saved.toObject() as unknown as Record<string, unknown>,
    );
  }

  /**
   * RC-R2 fix — atomicky nastaví roli JEN když se liší od cílové. Vrací dokument
   * PŘED změnou (pro výpočet wasPlayer/isPlayer), nebo null když role už cílová
   * byla (idempotentní no-op → žádný `playerCount` drift pod souběhem: druhý
   * z dvou souběžných stejných změn už filtr `role:{$ne}` nesplní a neinkrementuje).
   */
  async updateRoleIfChanged(
    id: string,
    role: number,
  ): Promise<WorldMembership | null> {
    const prev = await this.model
      .findOneAndUpdate(
        { _id: id, role: { $ne: role } },
        { $set: { role } },
        { new: false },
      )
      .lean()
      .exec();
    return prev
      ? this.toEntity(prev as unknown as Record<string, unknown>)
      : null;
  }

  async clearCharacter(id: string): Promise<WorldMembership | null> {
    const doc = await this.model
      .findByIdAndUpdate(
        id,
        { $unset: { characterPath: '', avatarUrl: '' } },
        { new: true },
      )
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async setPjPersonaAvatar(
    id: string,
    url: string | null,
  ): Promise<WorldMembership | null> {
    // $set při URL, $unset při null (plain update s undefined Mongoose ignoruje).
    const update = url
      ? { $set: { pjPersonaAvatarUrl: url } }
      : { $unset: { pjPersonaAvatarUrl: '' } };
    const doc = await this.model
      .findByIdAndUpdate(id, update, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  protected toEntity(doc: Record<string, unknown>): WorldMembership {
    return {
      id: String(doc._id),
      userId: doc.userId as string,
      worldId: doc.worldId as string,
      role: doc.role as number,
      joinedAt: doc.joinedAt as Date,
      avatarUrl: doc.avatarUrl as string | undefined,
      characterPath: doc.characterPath as string | undefined,
      group: doc.group as string | undefined,
      pjPersonaAvatarUrl: doc.pjPersonaAvatarUrl as string | undefined,
      isFree: (doc.isFree as boolean) ?? false,
      akj: (doc.akj as number) ?? 0,
      themeAdjust: doc.themeAdjust as WorldThemeAdjust | undefined,
      themeUserOverrides: doc.themeUserOverrides as
        | Record<string, string>
        | undefined,
      // 5.9b — per-člen vlastní motiv + pozadí (whitelist mapper: nutno zde,
      // jinak schema/zápis funguje, ale GET pole tiše zahodí).
      themeId: doc.themeId as string | null | undefined,
      themeBackgroundUrl: doc.themeBackgroundUrl as string | null | undefined,
      // 16.2c — per-člen skin deníku (whitelist mapper: jinak GET tiše zahodí).
      diarySkin: doc.diarySkin as string | null | undefined,
      chatColor: (doc.chatColor as string | null | undefined) ?? null,
      chatFont: (doc.chatFont as string | null | undefined) ?? null,
      chatFontSize: (doc.chatFontSize as string | null | undefined) ?? null,
      // 16.1d — per-člen skin chatu (whitelist mapper: jinak GET tiše zahodí).
      chatSkin: (doc.chatSkin as string | null | undefined) ?? null,
      diceSkinMapping:
        (doc.diceSkinMapping as Record<string, string> | null | undefined) ??
        null,
      jailedDiceSkins: (doc.jailedDiceSkins as string[] | undefined) ?? [],
      currentSceneId: (doc.currentSceneId as string | null | undefined) ?? null,
      chatGroupOrder: doc.chatGroupOrder as string[] | undefined,
      chatChannelOrder: doc.chatChannelOrder as
        | Record<string, string[]>
        | undefined,
      chatExpandedGroups: doc.chatExpandedGroups as string[] | undefined,
      chatPinnedOrder: doc.chatPinnedOrder as string[] | undefined,
      chatLastActiveChannelId: doc.chatLastActiveChannelId as
        | string
        | undefined,
    };
  }

  /**
   * 10.2-prep-1 — atomic `$set currentSceneId` přes `{userId, worldId}`.
   */
  async setCurrentScene(
    userId: string,
    worldId: string,
    sceneId: string | null,
  ): Promise<WorldMembership | null> {
    const doc = await this.model
      .findOneAndUpdate(
        { userId, worldId },
        { $set: { currentSceneId: sceneId } },
        { new: true },
      )
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  /**
   * 10.2-prep-1 — bulk `$set currentSceneId` pro N userIds ve stejném světě.
   * Použito pro `member.bulkAssignToScene` op (PJ přesune celou skupinu).
   */
  async setCurrentSceneForMany(
    userIds: string[],
    worldId: string,
    sceneId: string | null,
  ): Promise<number> {
    if (userIds.length === 0) return 0;
    const result = await this.model
      .updateMany(
        { userId: { $in: userIds }, worldId },
        { $set: { currentSceneId: sceneId } },
      )
      .exec();
    return result.modifiedCount;
  }

  /**
   * CD-04 — vyčistí `currentSceneId` u všech členů, kteří byli na smazané scéně
   * (jinak visící ref → hráč „uvízne" na neexistující scéně).
   */
  async clearSceneForAll(sceneId: string): Promise<number> {
    const result = await this.model
      .updateMany(
        { currentSceneId: sceneId },
        { $set: { currentSceneId: null } },
      )
      .exec();
    return result.modifiedCount;
  }
}

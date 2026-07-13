import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { ChatChannelSchemaClass } from '../schemas/chat-channel.schema';
import type {
  ChatChannel,
  ChatCombatant,
  ChatCombatState,
  ChatCombatConfig,
} from '../interfaces/chat-channel.interface';
import type { IChatChannelRepository } from '../interfaces/chat-channel-repository.interface';
import type { WorldRole } from '../../worlds/interfaces/world-membership.interface';

@Injectable()
export class MongoChatChannelRepository
  extends BaseMongoRepository<ChatChannel>
  implements IChatChannelRepository
{
  constructor(
    @InjectModel(ChatChannelSchemaClass.name)
    model: Model<ChatChannelSchemaClass>,
  ) {
    super(model as never);
  }

  async findGlobal(): Promise<ChatChannel | null> {
    const doc = await this.model
      .findOne({ isGlobal: true, isDeleted: false })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findGlobalByType(type: string): Promise<ChatChannel | null> {
    const doc = await this.model
      .findOne({ isGlobal: true, type, isDeleted: false })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findByGroupId(groupId: string): Promise<ChatChannel[]> {
    const docs = await this.model
      .find({ groupId, isDeleted: false })
      .sort({ order: 1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async countByWorldId(worldId: string): Promise<number> {
    // D-SEC-GAP-2026-07-11 — anti-abuse creation-flood: kumulativní strop
    // konverzací světa. Index { worldId: 1, groupId: 1 } (prefix worldId).
    return this.model.countDocuments({ worldId, isDeleted: false }).exec();
  }

  async findByWorldId(worldId: string): Promise<ChatChannel[]> {
    const docs = await this.model
      .find({ worldId, isDeleted: false })
      .sort({ order: 1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async softDeleteByWorldId(worldId: string): Promise<void> {
    await this.model
      .updateMany({ worldId }, { $set: { isDeleted: true } })
      .exec();
  }

  /** Párový restore k `softDeleteByWorldId` (obnova světa). */
  async restoreByWorldId(worldId: string): Promise<void> {
    await this.model
      .updateMany({ worldId }, { $set: { isDeleted: false } })
      .exec();
  }

  // ─── 16.1e — atomické operace nad combat rosterem ───────────────────────
  // Per-instance `$push`/`$set arrayFilters`/`$pull`, NE full-array replace
  // (race-safe při paralelní editaci HP — viz spec 4.2 / D-040 vzor mapy).

  async addCombatant(
    channelId: string,
    combatant: ChatCombatant,
  ): Promise<ChatChannel | null> {
    if (!this.isId(channelId)) return null;
    const doc = await this.model
      .findByIdAndUpdate(
        channelId,
        { $push: { combatants: combatant } },
        { new: true },
      )
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async updateCombatant(
    channelId: string,
    combatantId: string,
    patch: Record<string, unknown>,
  ): Promise<ChatChannel | null> {
    if (!this.isId(channelId)) return null;
    // `combatants.$.<key>` per klíč → nepřepíše paralelní změnu jiné položky.
    // FIX-41 — `'combatants.id': combatantId` je součástí FILTRU (ne jen
    // arrayFilters na updatu) → když combatant neexistuje, `findOneAndUpdate`
    // nenajde žádný dokument a vrátí `null` místo "tichého" úspěchu beze změny.
    const set: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      set[`combatants.$.${k}`] = v;
    }
    const doc = await this.model
      .findOneAndUpdate(
        { _id: channelId, 'combatants.id': combatantId },
        { $set: set },
        { new: true },
      )
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async removeCombatant(
    channelId: string,
    combatantId: string,
  ): Promise<ChatChannel | null> {
    if (!this.isId(channelId)) return null;
    // FIX-41 — zrcadlo `updateCombatant`: existence combatanta je součástí
    // filtru, jinak `$pull` na neexistující ID "tiše uspěje" (kanál beze
    // změny, ale volající dostane 200 místo 404).
    const doc = await this.model
      .findOneAndUpdate(
        { _id: channelId, 'combatants.id': combatantId },
        { $pull: { combatants: { id: combatantId } } },
        { new: true },
      )
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async setCombat(
    channelId: string,
    combat: ChatCombatState,
  ): Promise<ChatChannel | null> {
    if (!this.isId(channelId)) return null;
    // FIX-41 — cílený `$set` po jednotlivých cestách místo přepisu celého
    // `combat` objektu: 2 vedoucí měnící různá pole souběžně (round vs.
    // currentCombatantId) se navzájem nepřepíšou. `currentCombatantId` může
    // být `undefined` (konec boje / smazaný "na tahu") → `$unset`, protože
    // Mongoose `undefined` hodnotu v `$set` ignoruje (staré pole by přežilo).
    const update: Record<string, Record<string, unknown>> = {
      $set: { 'combat.active': combat.active, 'combat.round': combat.round },
    };
    if (combat.currentCombatantId === undefined) {
      update.$unset = { 'combat.currentCombatantId': '' };
    } else {
      update.$set['combat.currentCombatantId'] = combat.currentCombatantId;
    }
    const doc = await this.model
      .findByIdAndUpdate(channelId, update, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async setCombatConfig(
    channelId: string,
    config: ChatCombatConfig,
  ): Promise<ChatChannel | null> {
    if (!this.isId(channelId)) return null;
    const doc = await this.model
      .findByIdAndUpdate(
        channelId,
        { $set: { chatCombatConfig: config } },
        { new: true },
      )
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  private isId(id: string): boolean {
    return /^[0-9a-fA-F]{24}$/.test(id);
  }

  /** Krok 6.5b — bulk update `order` přes jednu `bulkWrite`. */
  async bulkUpdateOrders(
    items: { id: string; order: number }[],
  ): Promise<void> {
    if (items.length === 0) return;
    await this.model.bulkWrite(
      items.map((i) => ({
        updateOne: {
          filter: { _id: i.id },
          update: { $set: { order: i.order } },
        },
      })),
    );
  }

  protected toEntity(doc: Record<string, unknown>): ChatChannel {
    return {
      id: String(doc._id),
      groupId: (doc.groupId as string | null) ?? null,
      worldId: (doc.worldId as string | null) ?? null,
      name: doc.name as string,
      isGlobal: (doc.isGlobal as boolean) ?? false,
      accessMode: (doc.accessMode as ChatChannel['accessMode']) ?? 'all',
      allowedRoles: (doc.allowedRoles as WorldRole[]) ?? [],
      allowedMemberIds: (doc.allowedMemberIds as string[]) ?? [],
      lastMessageAt: doc.lastMessageAt as Date | undefined,
      lastMessagePreview: doc.lastMessagePreview as string | undefined,
      order: (doc.order as number) ?? 0,
      isDeleted: (doc.isDeleted as boolean) ?? false,
      type: (doc.type as string) ?? 'all',
      imageUrl: doc.imageUrl as string | undefined,
      linkedMemberUserId: doc.linkedMemberUserId as string | undefined,
      // 16.1e — bez whitelistu by GET zahodil roster (field-drift past D-066).
      combatants: (doc.combatants as ChatCombatant[] | undefined) ?? [],
      combat:
        (doc.combat as ChatCombatState | undefined) &&
        Object.keys(doc.combat as object).length > 0
          ? (doc.combat as ChatCombatState)
          : { active: false, round: 0 },
      chatCombatConfig:
        (doc.chatCombatConfig as ChatCombatConfig | undefined) ?? {},
      createdAt: doc.createdAt as Date,
    };
  }
}

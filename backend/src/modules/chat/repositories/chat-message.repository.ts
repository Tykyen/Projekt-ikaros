import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { ChatMessageSchemaClass } from '../schemas/chat-message.schema';
import type {
  ChatMessage,
  ChatMapRef,
} from '../interfaces/chat-message.interface';
import type { ChatAttachment } from '../interfaces/chat-attachment.interface';
import type { IChatMessageRepository } from '../interfaces/chat-message-repository.interface';

/**
 * D-066 (spec 20B B4b) — náhradní text moderačně skryté zprávy (M2/M3).
 * Konvence FE tombstone textů (vzor `*Zpráva byla smazána autorem*`).
 */
export const MODERATION_HIDDEN_CONTENT = '*Zpráva skryta moderací*';

@Injectable()
export class MongoChatMessageRepository
  extends BaseMongoRepository<ChatMessage>
  implements IChatMessageRepository
{
  constructor(
    @InjectModel(ChatMessageSchemaClass.name)
    model: Model<ChatMessageSchemaClass>,
  ) {
    super(model as never);
  }

  async findByChannelId(
    channelId: string,
    opts: { before?: string; limit: number; visibilityUserId?: string },
  ): Promise<ChatMessage[]> {
    const filter: Record<string, unknown> = { channelId };
    if (opts.before && Types.ObjectId.isValid(opts.before)) {
      filter._id = { $lt: new Types.ObjectId(opts.before) };
    }
    // Šepot filtr do DB query (ne až v service po `limit`) — pro ne-PJ vidí
    // jen veřejné zprávy + vlastní šepoty. Jinak by hráči po ořezu cizích
    // šepotů vyšlo < limit a stránkování (počet == plná stránka) by selhalo.
    // Vzor sdílený s `findFeed`.
    if (opts.visibilityUserId) {
      filter.$or = [
        { visibleTo: { $exists: false } },
        { visibleTo: { $size: 0 } },
        { visibleTo: opts.visibilityUserId },
      ];
    }
    const docs = await this.model
      .find(filter)
      .sort({ _id: -1 })
      .limit(opts.limit)
      .lean()
      .exec();
    return docs
      .map((d) => this.toEntity(d as unknown as Record<string, unknown>))
      .reverse();
  }

  async searchInChannels(
    channelIds: string[],
    query: string,
    limit: number,
  ): Promise<ChatMessage[]> {
    if (channelIds.length === 0 || !query) return [];
    // Escape regex metaznaků — uživatelský vstup hledáme jako prostý substring.
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const docs = await this.model
      .find({
        channelId: { $in: channelIds },
        isDeleted: { $ne: true },
        // D-066 — skrytou zprávu nesmí najít ani substring hledání (obsah v DB
        // zůstává kvůli revertu; match by prozradil, CO skrytá zpráva obsahuje).
        moderationHidden: { $ne: true },
        content: { $regex: escaped, $options: 'i' },
      })
      .sort({ _id: -1 })
      .limit(limit)
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findFeed(opts: {
    managerChannelIds: string[];
    memberChannelIds: string[];
    userId: string;
    before?: string;
    limit: number;
  }): Promise<ChatMessage[]> {
    const or: Record<string, unknown>[] = [];
    if (opts.managerChannelIds.length > 0) {
      or.push({ channelId: { $in: opts.managerChannelIds } });
    }
    if (opts.memberChannelIds.length > 0) {
      // Member vidí veřejné zprávy + jen vlastní whispery (visibleTo).
      or.push({
        channelId: { $in: opts.memberChannelIds },
        $or: [
          { visibleTo: { $exists: false } },
          { visibleTo: { $size: 0 } },
          { visibleTo: opts.userId },
        ],
      });
    }
    if (or.length === 0) return [];
    const filter: Record<string, unknown> = {
      isDeleted: { $ne: true },
      // D-066 — moderačně skrytá zpráva do souhrnu chatů nepatří (jako smazaná).
      moderationHidden: { $ne: true },
      // Feed = „co napsali ostatní" → vlastní zprávy se nezobrazují.
      senderId: { $ne: opts.userId },
      $or: or,
    };
    if (opts.before && Types.ObjectId.isValid(opts.before)) {
      filter._id = { $lt: new Types.ObjectId(opts.before) };
    }
    const docs = await this.model
      .find(filter)
      .sort({ _id: -1 })
      .limit(opts.limit)
      .lean()
      .exec();
    // Desc (nejnovější první) — feed se renderuje shora dolů, NEreversovat.
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findByNonce(
    channelId: string,
    clientNonce: string,
  ): Promise<ChatMessage | null> {
    if (!clientNonce) return null;
    const doc = await this.model
      .findOne({ channelId, clientNonce })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async countAfter(channelId: string, messageId: string): Promise<number> {
    if (!Types.ObjectId.isValid(messageId)) return 0;
    return this.model
      .countDocuments({
        channelId,
        isDeleted: { $ne: true },
        _id: { $gt: new Types.ObjectId(messageId) },
      })
      .exec();
  }

  /**
   * D-NEW-chat-mention-sidebar-dot (2026-05-21) — Počet zpráv, kde je `userId`
   * v `mentions[]`, po `messageId` (last-read). Použito pro červený dot v sidebaru.
   */
  async countMentionsAfter(
    channelId: string,
    messageId: string,
    userId: string,
  ): Promise<number> {
    if (!Types.ObjectId.isValid(messageId)) return 0;
    return this.model
      .countDocuments({
        channelId,
        isDeleted: { $ne: true },
        _id: { $gt: new Types.ObjectId(messageId) },
        mentions: userId,
      })
      .exec();
  }

  async softDeleteByChannelId(channelId: string): Promise<void> {
    await this.model
      .updateMany({ channelId }, { $set: { isDeleted: true, content: null } })
      .exec();
  }

  /**
   * Soft-delete světa = recovery-safe: NEnuluje `content` (na rozdíl od
   * `softDeleteByChannelId`), aby obnova světa (do 30 dní) vrátila i obsah zpráv.
   */
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

  /**
   * GDPR (plný audit 2026-07-11) — hard-delete účtu: anonymizuj identitu
   * odesílatele ve VŠECH jeho zprávách. `senderName` je snapshot username v době
   * odeslání → bez tohoto zůstane napořád identifikovatelný. Obsah NEnulujeme
   * (zachování konverzace ostatních; plná content-erasure = právní rozhodnutí).
   */
  async anonymizeBySender(senderId: string): Promise<void> {
    await this.model
      .updateMany(
        { senderId },
        {
          $set: {
            senderName: 'Smazaný uživatel',
            senderAvatarUrl: null,
            overrideName: null,
            overrideAvatarUrl: null,
          },
        },
      )
      .exec();
  }

  async addReaction(
    messageId: string,
    emoji: string,
    userId: string,
  ): Promise<ChatMessage | null> {
    if (!Types.ObjectId.isValid(messageId)) return null;
    const doc = await this.model
      .findByIdAndUpdate(
        messageId,
        { $addToSet: { [`reactions.${emoji}`]: userId } },
        { new: true },
      )
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async removeReaction(
    messageId: string,
    emoji: string,
    userId: string,
  ): Promise<ChatMessage | null> {
    if (!Types.ObjectId.isValid(messageId)) return null;
    const doc = await this.model
      .findByIdAndUpdate(
        messageId,
        { $pull: { [`reactions.${emoji}`]: userId } },
        { new: true },
      )
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  /**
   * FIX-40 — filtr `{ [emoji]: { $ne: userId } }` dělá check-and-set atomický
   * (Mongo vyhodnotí filtr i update na tomtéž dokumentu bez mezery). Když
   * mezitím reakci přidal jiný souběžný toggle, filtr nesedí → `null`.
   */
  async addReactionIfAbsent(
    messageId: string,
    emoji: string,
    userId: string,
  ): Promise<ChatMessage | null> {
    if (!Types.ObjectId.isValid(messageId)) return null;
    const doc = await this.model
      .findOneAndUpdate(
        { _id: messageId, [`reactions.${emoji}`]: { $ne: userId } },
        { $addToSet: { [`reactions.${emoji}`]: userId } },
        { new: true },
      )
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  /** Zrcadlo `addReactionIfAbsent` — CAS podmínka na PŘÍTOMNOST. */
  async removeReactionIfPresent(
    messageId: string,
    emoji: string,
    userId: string,
  ): Promise<ChatMessage | null> {
    if (!Types.ObjectId.isValid(messageId)) return null;
    const doc = await this.model
      .findOneAndUpdate(
        { _id: messageId, [`reactions.${emoji}`]: userId },
        { $pull: { [`reactions.${emoji}`]: userId } },
        { new: true },
      )
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async pruneChannel(
    channelId: string,
    olderThan: Date,
    keepLast: number,
  ): Promise<{ deletedCount: number; attachments: ChatAttachment[] }> {
    const recent = await this.model
      .find({ channelId })
      .sort({ createdAt: -1 })
      .limit(keepLast)
      .select('_id')
      .lean()
      .exec();
    const keepIds = recent.map((d) => String((d as { _id: unknown })._id));
    const filter = {
      channelId,
      createdAt: { $lt: olderThan },
      _id: { $nin: keepIds },
    };
    // Před smazáním posbírat přílohy mazaných zpráv — volající (CleanMessages
    // job) je předá do Cloudinary úklidu, jinak by assety osiřely (4.3b).
    const toDelete = await this.model
      .find(filter)
      .select('attachments')
      .lean()
      .exec();
    const attachments = toDelete.flatMap(
      (d) => (d as { attachments?: ChatAttachment[] }).attachments ?? [],
    );
    const result = await this.model.deleteMany(filter).exec();
    return { deletedCount: result.deletedCount ?? 0, attachments };
  }

  protected toEntity(doc: Record<string, unknown>): ChatMessage {
    // D-066 (B4b) — moderačně skrytá zpráva (M2/M3): originál zůstává v DB
    // (revert), ale ven NIKDY neodchází. Maskuje se content, attachments,
    // mapRef i dicePayload pro VŠECHNY viewery (vlastník i PJ; moderátor má
    // snapshot v moderačním logu). Jediný choke-point pro world i global chat.
    const moderationHidden = (doc.moderationHidden as boolean) ?? false;
    return {
      id: String(doc._id),
      channelId: doc.channelId as string,
      worldId: (doc.worldId as string | null) ?? null,
      senderId: doc.senderId as string,
      senderName: doc.senderName as string,
      senderAvatarUrl: doc.senderAvatarUrl as string | undefined,
      overrideName: doc.overrideName as string | undefined,
      overrideAvatarUrl: doc.overrideAvatarUrl as string | undefined,
      overridePageSlug: doc.overridePageSlug as string | undefined,
      content: moderationHidden
        ? MODERATION_HIDDEN_CONTENT
        : (doc.content as string | null),
      isEdited: (doc.isEdited as boolean) ?? false,
      isDeleted: (doc.isDeleted as boolean) ?? false,
      moderationHidden,
      isSystem: (doc.isSystem as boolean) ?? false,
      isAnonymous: (doc.isAnonymous as boolean) ?? false,
      rpDate: doc.rpDate as string | undefined,
      replyToId: doc.replyToId as string | undefined,
      replyToPreview: doc.replyToPreview as string | undefined,
      replyToSenderName: doc.replyToSenderName as string | undefined,
      visibleTo: doc.visibleTo as string[] | undefined,
      reactions: (doc.reactions as Record<string, string[]>) ?? {},
      attachments: moderationHidden
        ? []
        : ((doc.attachments as ChatAttachment[]) ?? []),
      mapRef: moderationHidden
        ? null
        : ((doc.mapRef as ChatMapRef | null | undefined) ?? null),
      expiresAt: doc.expiresAt as Date | undefined,
      customFont: (doc.customFont as string | null) ?? null,
      customFontSize: (doc.customFontSize as string | null) ?? null,
      color: (doc.color as string | null) ?? null,
      isDiceRoll: (doc.isDiceRoll as boolean) ?? false,
      clientNonce: (doc.clientNonce as string | null | undefined) ?? null,
      mentions: (doc.mentions as string[] | undefined) ?? [],
      dicePayload: moderationHidden
        ? null
        : ((doc.dicePayload as Record<string, unknown> | null | undefined) ??
          null),
      diceSkin: (doc.diceSkin as string | null | undefined) ?? null,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}

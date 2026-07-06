import type { ChannelReadStatus } from './channel-read-status.interface';

export interface IChannelReadStatusRepository {
  findByUserAndChannel(
    userId: string,
    channelId: string,
  ): Promise<ChannelReadStatus | null>;
  findByUserAndChannels(
    userId: string,
    channelIds: string[],
  ): Promise<ChannelReadStatus[]>;
  upsert(
    userId: string,
    channelId: string,
    lastReadMessageId: string,
  ): Promise<ChannelReadStatus>;
  /** FIX-35 — úklid osiřelých read-status záznamů po smazání kanálu. */
  deleteByChannelId(channelId: string): Promise<void>;
}

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
}

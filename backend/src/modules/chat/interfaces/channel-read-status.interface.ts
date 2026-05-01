export interface ChannelReadStatus {
  id: string;
  userId: string;
  channelId: string;
  lastReadMessageId: string | null;
  lastReadAt: Date;
}

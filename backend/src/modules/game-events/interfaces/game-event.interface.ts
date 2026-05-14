export interface EventConfirmation {
  userId: string;
  userName: string;
}

export interface EventComment {
  id: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: Date;
  editedAt: Date | null;
  reactions: Record<string, string[]>;
  isDeleted: boolean;
}

export interface GameEvent {
  id: string;
  worldId: string;
  title: string;
  date: string;
  description: string;
  imageUrl: string | null;
  targetGroup: string | null;
  groupOnly: boolean;
  confirmable: boolean;
  confirmedBy: EventConfirmation[];
  comments: EventComment[];
  reminderSent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

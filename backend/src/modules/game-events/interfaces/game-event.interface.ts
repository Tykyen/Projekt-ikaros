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
  imageFocalX: number | null;
  imageFocalY: number | null;
  imageZoom: number | null;
  imageFit: 'cover' | 'contain' | null;
  targetGroup: string | null;
  groupOnly: boolean;
  confirmable: boolean;
  confirmedBy: EventConfirmation[];
  comments: EventComment[];
  /** Příznak odeslání připomínky 24h před začátkem (kategorie `worldEvent`). */
  reminderSent: boolean;
  /** 15.9 — příznak odeslání připomínky 1h před začátkem. */
  reminder1hSent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** 15.9 — pole příznaku připomínky, podle okna (24h / 1h). */
export type ReminderField = 'reminderSent' | 'reminder1hSent';

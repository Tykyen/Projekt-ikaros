export interface GameEvent {
  id: string;
  worldId: string;
  title: string;
  date: string;       // ISO 8601 string, slouží jako sort key
  description?: string;
  reminderSent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type WorldNewsType = 'info' | 'alert' | 'system';

export interface WorldNewsItem {
  id: string;
  worldId: string | null; // null = globální
  title: string;
  content: string;
  date: string; // ISO 8601 v UTC (...Z)
  type: WorldNewsType;
  link?: string;
  createdBy?: string; // userId; undefined u legacy migrovaných
}

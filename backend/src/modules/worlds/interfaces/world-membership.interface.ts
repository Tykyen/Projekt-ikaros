export enum WorldRole {
  Pending = -1,
  Hrac = 0,
  Korektor = 1,
  PomocnyPJ = 2,
  PJ = 3,
}

export interface WorldMembership {
  id: string;
  userId: string;
  worldId: string;
  role: WorldRole;
  joinedAt: Date;
  avatarUrl?: string;
  characterPath?: string;
  group?: string;
  akj: number;
}

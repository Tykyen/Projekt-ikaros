export enum UserRole {
  Superadmin = 1,
  Admin = 2,
  PJ = 3,
  Korektor = 4,
  Hrac = 5,
  Ctenar = 6,
  Zadatel = 7,
  Zakaz = 8,
  Ikarus = 9,
  SpravceClankuu = 10,
  SpravceGalerie = 11,
  SpravceDisukzi = 12,
}

export interface User {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  displayName?: string;
  avatarUrl?: string;
  profileImageUrl?: string;
  characterPath?: string;
  ikarosSkin?: string;
  akj: boolean;
  themeSettings: Record<string, unknown>;
  chatPreferences: Record<string, unknown>;
  isOnline: boolean;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicUser {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  characterPath?: string;
  role: UserRole;
  createdAt: Date;
}

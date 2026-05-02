import type { AccessRequirement } from '../../pages/interfaces/page.interface';

export interface InfoBlock {
  label: string;
  value: string;
}

export type TagValue = InfoBlock; // { label: string; value: string }

export interface SchemaBlock {
  key: string;
  label: string;
  type: string;
  config?: Record<string, unknown>;
  order: number;
}

export interface PlayerCharacter {
  name: string;
  slug: string;
}

export interface CharacterDirectoryEntry {
  id: string;
  slug: string;
  name: string;
  imageUrl?: string;
  isNpc: boolean;
}

export interface Character {
  id: string;
  slug: string;
  name: string;
  worldId: string;
  userId?: string;
  isNpc: boolean;
  imageUrl?: string;

  // Veřejná část
  publicBio: string;
  publicInfoBlocks: InfoBlock[];

  // Soukromá část
  privateBio: string;
  privateInfoBlocks: InfoBlock[];

  // Deník
  diaryData: Record<string, unknown>;
  extraBlocks: SchemaBlock[];

  // Společné
  campaignSubjectId?: string;
  accessRequirements: AccessRequirement[];
  customData?: Record<string, unknown>;
  createdAt: Date;
}

export interface CharacterPublicView {
  id: string;
  slug: string;
  name: string;
  worldId: string;
  isNpc: boolean;
  imageUrl?: string;
  publicBio: string;
  publicInfoBlocks: InfoBlock[];
}

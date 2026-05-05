import type { TagValue, SchemaBlock } from '../../characters/interfaces/character.interface';

export interface NpcTemplate {
  id: string;
  worldId: string | null;
  originTemplateId?: string;
  name: string;
  imageUrl?: string;
  notes: string;
  maxHp: number;
  armor: number;
  injury: number;
  movement: number;
  initiativeBase: number;
  abilities: TagValue[];
  diarySchema: SchemaBlock[];
  diaryData: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

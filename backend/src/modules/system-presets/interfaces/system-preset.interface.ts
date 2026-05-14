import type { SchemaBlock } from '../../characters/interfaces/character.interface';

export interface SystemPreset {
  system: string;
  displayName: string;
  schema: SchemaBlock[];
}

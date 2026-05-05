export class CreateMapDto {
  name?: string;
  imageUrl?: string;
  worldId?: string;
  folder?: string;
  templateId?: string;
  config?: {
    size?: number;
    originX?: number;
    originY?: number;
    showGrid?: boolean;
  };
  tokens?: Record<string, unknown>[];
  npcTemplates?: Record<string, unknown>[];
  effects?: Record<string, unknown>[];
  fogEnabled?: boolean;
  revealedHexes?: { q: number; r: number }[];
  isActive?: boolean;
  isHidden?: boolean;
  isLocked?: boolean;
  activeSoundIds?: string[];
}

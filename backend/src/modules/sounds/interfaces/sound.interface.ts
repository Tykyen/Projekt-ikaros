import type {
  SoundMediaType,
  SoundPrimaryFunction,
  SoundEnvironment,
  SoundEmotionalTone,
  SoundOnsetProfile,
  SoundOutroProfile,
  SoundFactionStyle,
  SoundTechLevel,
  SoundMagicLevel,
  SoundCombatEnergy,
  SoundStatus,
} from '../schemas/sound.schema';

export type {
  SoundMediaType,
  SoundPrimaryFunction,
  SoundEnvironment,
  SoundEmotionalTone,
  SoundOnsetProfile,
  SoundOutroProfile,
  SoundFactionStyle,
  SoundTechLevel,
  SoundMagicLevel,
  SoundCombatEnergy,
  SoundStatus,
};

export interface Sound {
  id: string;
  worldId: string | null;
  name: string;
  youtubeUrl: string;
  mediaType: SoundMediaType;
  primaryFunction: SoundPrimaryFunction;
  environment: SoundEnvironment;
  emotionalTone: SoundEmotionalTone;
  intensity: number;
  duration: number;
  loop: boolean;
  onsetProfile: SoundOnsetProfile;
  outroProfile: SoundOutroProfile;
  factionStyle: SoundFactionStyle;
  techLevel: SoundTechLevel;
  magicLevel: SoundMagicLevel;
  combatEnergy: SoundCombatEnergy;
  tags: string[];
  notes: string;
  status: SoundStatus;
  proposedBy: string | null;
  proposedByWorldId: string | null;
  rejectReason: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

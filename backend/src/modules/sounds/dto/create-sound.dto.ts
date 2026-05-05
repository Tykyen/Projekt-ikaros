import { IsString, IsOptional, IsEnum, IsNumber, IsBoolean, IsArray, Min, Max } from 'class-validator';
import { SoundMediaType, SoundPrimaryFunction, SoundEnvironment, SoundEmotionalTone, SoundOnsetProfile, SoundOutroProfile, SoundFactionStyle, SoundTechLevel, SoundMagicLevel, SoundCombatEnergy } from '../schemas/sound.schema';

export class CreateSoundDto {
  @IsString() name: string;
  @IsString() youtubeUrl: string;
  @IsOptional() @IsEnum(SoundMediaType) mediaType?: SoundMediaType;
  @IsOptional() @IsEnum(SoundPrimaryFunction) primaryFunction?: SoundPrimaryFunction;
  @IsOptional() @IsEnum(SoundEnvironment) environment?: SoundEnvironment;
  @IsOptional() @IsEnum(SoundEmotionalTone) emotionalTone?: SoundEmotionalTone;
  @IsOptional() @IsNumber() @Min(1) @Max(5) intensity?: number;
  @IsOptional() @IsNumber() @Min(0) duration?: number;
  @IsOptional() @IsBoolean() loop?: boolean;
  @IsOptional() @IsEnum(SoundOnsetProfile) onsetProfile?: SoundOnsetProfile;
  @IsOptional() @IsEnum(SoundOutroProfile) outroProfile?: SoundOutroProfile;
  @IsOptional() @IsEnum(SoundFactionStyle) factionStyle?: SoundFactionStyle;
  @IsOptional() @IsEnum(SoundTechLevel) techLevel?: SoundTechLevel;
  @IsOptional() @IsEnum(SoundMagicLevel) magicLevel?: SoundMagicLevel;
  @IsOptional() @IsEnum(SoundCombatEnergy) combatEnergy?: SoundCombatEnergy;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() notes?: string;
}

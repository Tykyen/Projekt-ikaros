import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SoundDocument = HydratedDocument<SoundSchemaClass>;

export enum SoundMediaType { music = 'music', ambient = 'ambient', sfx = 'sfx', signal = 'signal', voice = 'voice' }
export enum SoundPrimaryFunction { safe = 'safe', social = 'social', exploration = 'exploration', tension = 'tension', threat = 'threat', combat = 'combat', ritual = 'ritual', horror = 'horror', revelation = 'revelation', aftermath = 'aftermath', transition = 'transition', system = 'system' }
export enum SoundEnvironment { neutral = 'neutral', nature = 'nature', urban = 'urban', interior = 'interior', industrial = 'industrial', military = 'military', sacral = 'sacral', arcane = 'arcane', digital = 'digital', alien = 'alien', ruin = 'ruin', void = 'void' }
export enum SoundEmotionalTone { calm = 'calm', wonder = 'wonder', melancholy = 'melancholy', mystery = 'mystery', dread = 'dread', fear = 'fear', urgency = 'urgency', aggression = 'aggression', grief = 'grief', awe = 'awe', faith = 'faith', corruption = 'corruption' }
export enum SoundOnsetProfile { instant = 'instant', fast = 'fast', soft = 'soft', slow = 'slow' }
export enum SoundOutroProfile { hard = 'hard', soft = 'soft', fade = 'fade', seamless = 'seamless' }
export enum SoundFactionStyle { civilian = 'civilian', noble = 'noble', religious = 'religious', military = 'military', corporate = 'corporate', criminal = 'criminal', tribal = 'tribal', arcane = 'arcane', alien = 'alien' }
export enum SoundTechLevel { preindustrial = 'preindustrial', industrial = 'industrial', modern = 'modern', advanced = 'advanced', posthuman = 'posthuman' }
export enum SoundMagicLevel { none = 'none', low = 'low', medium = 'medium', high = 'high', extreme = 'extreme' }
export enum SoundCombatEnergy { none = 'none', low = 'low', medium = 'medium', high = 'high' }
export type SoundStatus = 'active' | 'pending' | 'rejected';

@Schema({ timestamps: true, collection: 'sounds' })
export class SoundSchemaClass {
  @Prop({ required: false, default: null }) worldId: string | null;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) youtubeUrl: string;
  @Prop({ enum: SoundMediaType, default: SoundMediaType.music }) mediaType: SoundMediaType;
  @Prop({ enum: SoundPrimaryFunction, default: SoundPrimaryFunction.safe }) primaryFunction: SoundPrimaryFunction;
  @Prop({ enum: SoundEnvironment, default: SoundEnvironment.neutral }) environment: SoundEnvironment;
  @Prop({ enum: SoundEmotionalTone, default: SoundEmotionalTone.calm }) emotionalTone: SoundEmotionalTone;
  @Prop({ default: 1, min: 1, max: 5 }) intensity: number;
  @Prop({ default: 0 }) duration: number;
  @Prop({ default: true }) loop: boolean;
  @Prop({ enum: SoundOnsetProfile, default: SoundOnsetProfile.soft }) onsetProfile: SoundOnsetProfile;
  @Prop({ enum: SoundOutroProfile, default: SoundOutroProfile.fade }) outroProfile: SoundOutroProfile;
  @Prop({ enum: SoundFactionStyle, default: SoundFactionStyle.civilian }) factionStyle: SoundFactionStyle;
  @Prop({ enum: SoundTechLevel, default: SoundTechLevel.modern }) techLevel: SoundTechLevel;
  @Prop({ enum: SoundMagicLevel, default: SoundMagicLevel.none }) magicLevel: SoundMagicLevel;
  @Prop({ enum: SoundCombatEnergy, default: SoundCombatEnergy.none }) combatEnergy: SoundCombatEnergy;
  @Prop({ type: [String], default: [] }) tags: string[];
  @Prop({ default: '' }) notes: string;
  @Prop({ default: 'active' }) status: SoundStatus;
  @Prop({ required: false, default: null }) proposedBy: string | null;
  @Prop({ required: false, default: null }) proposedByWorldId: string | null;
  @Prop({ required: false, default: null }) rejectReason: string | null;
  @Prop({ required: true }) createdBy: string;
}

export const SoundSchema = SchemaFactory.createForClass(SoundSchemaClass);
SoundSchema.index({ worldId: 1, name: 1 });
SoundSchema.index({ worldId: 1, mediaType: 1 });
SoundSchema.index({ status: 1 });

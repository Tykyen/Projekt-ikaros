import {
  TokenAddOpDto,
  TokenMoveOpDto,
  TokenRemoveOpDto,
  TokenUpdateOpDto,
} from './token-ops.dto';
import {
  EffectAddOpDto,
  EffectRemoveOpDto,
  EffectUpdateOpDto,
} from './effect-ops.dto';
import { FogSetOpDto, FogBrushOpDto } from './fog-ops.dto';
import {
  SceneStateOpDto,
  ScenePlayerStateOpDto,
  SceneConfigOpDto,
  SceneImageOpDto,
  SceneNameOpDto,
  SceneFolderOpDto,
  SceneDeactivateOpDto,
  SceneFogReplaceOpDto,
  SceneEffectsReplaceOpDto,
  SceneWallsReplaceOpDto,
  SceneLightsReplaceOpDto,
  SceneNpcTemplatesReplaceOpDto,
  SceneTokensReplaceNpcOpDto,
  SceneSoundsSetOpDto,
  SceneActiveCharactersAddOpDto,
  SceneActiveCharactersRemoveOpDto,
  SceneActiveBestieAddOpDto,
  SceneActiveBestieRemoveOpDto,
  SceneTokensClearOpDto,
  SceneTokensReplaceOpDto,
} from './scene-ops.dto';
import {
  DrawingAddOpDto,
  DrawingRemoveOpDto,
  DrawingClearOpDto,
} from './drawing-ops.dto';
import { SoundPlaylistOpDto } from './sound-ops.dto';
import {
  CombatStartOpDto,
  CombatTurnOpDto,
  CombatEndOpDto,
  CombatReorderOpDto,
  CombatEffectAddOpDto,
  CombatEffectRemoveOpDto,
} from './combat-ops.dto';
import {
  NpcTemplateAddOpDto,
  NpcTemplateRemoveOpDto,
  NpcTemplateUpdateOpDto,
} from './npc-template-ops.dto';
import { DiceRollOpDto } from './dice-ops.dto';

/**
 * 10.2-prep-1 — registry per-scene op DTOs.
 *
 * Discriminator field je `type`. `OperationPayloadValidator.validateMapOp`
 * vyhledá příslušnou class podle `input.type` a pustí ji přes class-validator.
 *
 * Spec: docs/arch/maps/operations/data-models.md § OperationPayload katalog.
 */

type ClassType<T> = new (...args: unknown[]) => T;

export const MAP_OPERATION_DTOS: Record<string, ClassType<object>> = {
  // Token
  'token.add': TokenAddOpDto,
  'token.move': TokenMoveOpDto,
  'token.remove': TokenRemoveOpDto,
  'token.update': TokenUpdateOpDto,
  // Effect
  'effect.add': EffectAddOpDto,
  'effect.remove': EffectRemoveOpDto,
  'effect.update': EffectUpdateOpDto,
  // 15.4 — Drawing (anotace)
  'drawing.add': DrawingAddOpDto,
  'drawing.remove': DrawingRemoveOpDto,
  'drawing.clear': DrawingClearOpDto,
  // Fog
  'fog.set': FogSetOpDto,
  'fog.brush': FogBrushOpDto,
  // Scene
  'scene.state': SceneStateOpDto,
  'scene.playerState': ScenePlayerStateOpDto,
  'scene.config': SceneConfigOpDto,
  'scene.image': SceneImageOpDto,
  'scene.name': SceneNameOpDto,
  'scene.folder': SceneFolderOpDto,
  'scene.deactivate': SceneDeactivateOpDto,
  // 10.2c-edit-2 — load šablony sekvence
  'scene.fog.replace': SceneFogReplaceOpDto,
  'scene.effects.replace': SceneEffectsReplaceOpDto,
  // 17.2 — import UVTT: zdi/světla
  'scene.walls.replace': SceneWallsReplaceOpDto,
  'scene.lights.replace': SceneLightsReplaceOpDto,
  'scene.npc-templates.replace': SceneNpcTemplatesReplaceOpDto,
  'scene.tokens.replace-npc': SceneTokensReplaceNpcOpDto,
  'scene.sounds.set': SceneSoundsSetOpDto,
  // 10.2c-edit-7 — per-scéna whitelist postav a bestií
  'scene.activeCharacters.add': SceneActiveCharactersAddOpDto,
  'scene.activeCharacters.remove': SceneActiveCharactersRemoveOpDto,
  'scene.activeBestie.add': SceneActiveBestieAddOpDto,
  'scene.activeBestie.remove': SceneActiveBestieRemoveOpDto,
  // 10.2c-edit-7 — vyčistit scénu od tokenů
  'scene.tokens.clear': SceneTokensClearOpDto,
  'scene.tokens.replace': SceneTokensReplaceOpDto,
  // Sound
  'sound.playlist': SoundPlaylistOpDto,
  // Combat
  'combat.start': CombatStartOpDto,
  'combat.turn': CombatTurnOpDto,
  'combat.end': CombatEndOpDto,
  'combat.reorder': CombatReorderOpDto,
  'combat.effect.add': CombatEffectAddOpDto,
  'combat.effect.remove': CombatEffectRemoveOpDto,
  // NPC template
  'npcTemplate.add': NpcTemplateAddOpDto,
  'npcTemplate.remove': NpcTemplateRemoveOpDto,
  'npcTemplate.update': NpcTemplateUpdateOpDto,
  // Dice
  'dice.roll': DiceRollOpDto,
};

export type MapOperationType = keyof typeof MAP_OPERATION_DTOS;

/**
 * Discriminated union — výstup `OperationPayloadValidator.validateMapOp`.
 * Server-side kód kontroluje `op.type` a kompiler ví, jaké args jsou dostupné.
 */
export type MapOperationPayload =
  | TokenAddOpDto
  | TokenMoveOpDto
  | TokenRemoveOpDto
  | TokenUpdateOpDto
  | EffectAddOpDto
  | EffectRemoveOpDto
  | EffectUpdateOpDto
  | DrawingAddOpDto
  | DrawingRemoveOpDto
  | DrawingClearOpDto
  | FogSetOpDto
  | FogBrushOpDto
  | SceneStateOpDto
  | ScenePlayerStateOpDto
  | SceneConfigOpDto
  | SceneImageOpDto
  | SceneNameOpDto
  | SceneFolderOpDto
  | SceneDeactivateOpDto
  | SceneFogReplaceOpDto
  | SceneEffectsReplaceOpDto
  | SceneWallsReplaceOpDto
  | SceneLightsReplaceOpDto
  | SceneNpcTemplatesReplaceOpDto
  | SceneTokensReplaceNpcOpDto
  | SceneSoundsSetOpDto
  | SceneActiveCharactersAddOpDto
  | SceneActiveCharactersRemoveOpDto
  | SceneActiveBestieAddOpDto
  | SceneActiveBestieRemoveOpDto
  | SceneTokensClearOpDto
  | SceneTokensReplaceOpDto
  | SoundPlaylistOpDto
  | CombatStartOpDto
  | CombatTurnOpDto
  | CombatEndOpDto
  | CombatReorderOpDto
  | CombatEffectAddOpDto
  | CombatEffectRemoveOpDto
  | NpcTemplateAddOpDto
  | NpcTemplateRemoveOpDto
  | NpcTemplateUpdateOpDto
  | DiceRollOpDto;

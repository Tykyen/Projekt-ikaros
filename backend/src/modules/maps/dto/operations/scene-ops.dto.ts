import {
  Equals,
  IsBoolean,
  IsOptional,
  IsString,
  IsObject,
  IsArray,
  ValidateIf,
} from 'class-validator';

/**
 * 10.2-prep-1 — scene mutation operations DTOs.
 * Spec: docs/arch/maps/operations/data-models.md § Scene state operace.
 */

export class SceneStateOpDto {
  @Equals('scene.state') type!: 'scene.state';
  @IsOptional() @IsBoolean() isHidden?: boolean;
  @IsOptional() @IsBoolean() isLocked?: boolean;
}

/**
 * 10.2n — per-hráč override skrytí/zámku. PJ-only (hráč spadne do authorizer
 * `default` throw). `boolean` = nastav override, `null` = smaž override pole
 * (fallback na scéna-default), `undefined` = beze změny pole.
 * `@IsOptional()` přeskočí validaci pro `null`/`undefined`.
 */
export class ScenePlayerStateOpDto {
  @Equals('scene.playerState') type!: 'scene.playerState';
  @IsString() userId!: string;
  @IsOptional() @IsBoolean() isHidden?: boolean | null;
  @IsOptional() @IsBoolean() isLocked?: boolean | null;
}

export class SceneConfigOpDto {
  @Equals('scene.config') type!: 'scene.config';
  @IsObject() config!: Record<string, unknown>;
}

export class SceneImageOpDto {
  @Equals('scene.image') type!: 'scene.image';
  @IsString() imageUrl!: string;
}

export class SceneNameOpDto {
  @Equals('scene.name') type!: 'scene.name';
  @IsString() name!: string;
}

export class SceneFolderOpDto {
  @Equals('scene.folder') type!: 'scene.folder';
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  folder!: string | null;
}

/**
 * 10.2c-edit-1 — deaktivace scény + cascade unassign všech hráčů s
 * `currentSceneId === scene.id`. PJ-only, idempotent (no-op když už neaktivní).
 *
 * Side-effecty (atomic):
 *   1. scene.isActive = false
 *   2. pro každý WorldMembership s currentSceneId === scene.id:
 *      - membership.currentSceneId = null
 *      - generovat member.unassign ve worldOperations
 *   3. WS broadcast: map:operation + N× world:operation + N× map:reassigned
 *
 * Bez body args — sceneId je v URL.
 */
export class SceneDeactivateOpDto {
  @Equals('scene.deactivate') type!: 'scene.deactivate';
}

/**
 * D-NEW-INV-MAPS — aktivace scény jako operace (inverse `scene.deactivate`).
 * PJ-only (authorizer default), idempotent (no-op když už aktivní — CAS).
 *
 * POZOR: NEobnovuje member přiřazení (cascade unassign z deactivate) — každý
 * cascade `member.unassign` má ve worldOperations vlastní inverse
 * `member.assignToScene`, undo tooling je přehraje zvlášť. Bez body args.
 */
export class SceneActivateOpDto {
  @Equals('scene.activate') type!: 'scene.activate';
}

/**
 * 10.2c-edit-2 — bulk replace polí scény pro load šablony z knihovny.
 * Klient pošle sekvenci těchto ops po sobě (image, config, fog, effects,
 * npc-templates, tokens.replace-npc, sounds.set). Není transakční celek
 * — částečný stav povolený, klient UX toast + retry.
 *
 * Všechny PJ-only.
 */

export class SceneFogReplaceOpDto {
  @Equals('scene.fog.replace') type!: 'scene.fog.replace';
  @IsBoolean() fogEnabled!: boolean;
  @IsArray() revealedHexes!: unknown[];
}

export class SceneEffectsReplaceOpDto {
  @Equals('scene.effects.replace') type!: 'scene.effects.replace';
  @IsArray() effects!: unknown[];
}

/**
 * 17.2 — import UVTT: nahrazení zdí/světel scény (bulk replace, PJ-only).
 * Vzor `scene.effects.replace`.
 */
export class SceneWallsReplaceOpDto {
  @Equals('scene.walls.replace') type!: 'scene.walls.replace';
  @IsArray() walls!: unknown[];
}

export class SceneLightsReplaceOpDto {
  @Equals('scene.lights.replace') type!: 'scene.lights.replace';
  @IsArray() lights!: unknown[];
}

export class SceneNpcTemplatesReplaceOpDto {
  @Equals('scene.npc-templates.replace')
  type!: 'scene.npc-templates.replace';
  @IsArray() npcTemplates!: unknown[];
}

/**
 * 10.2c-edit-2 — replace POUZE NPC tokeny ve scéně (PC tokeny se zachovávají
 * jako jsou). Server zfiltruje payload na isNpc===true (defense in depth);
 * PC tokens v body jsou ignorovány. Atomic: $set tokens na (existing PC) + payload NPC.
 */
export class SceneTokensReplaceNpcOpDto {
  @Equals('scene.tokens.replace-npc') type!: 'scene.tokens.replace-npc';
  @IsArray() tokens!: unknown[];
}

/**
 * D-NEW-INV-MAPS — bulk replace anotací (kreseb). Primárně inverse pro
 * `drawing.clear` (undo obnoví smazané kresby); vzor `scene.walls.replace`.
 * PJ-only (authorizer default).
 */
export class SceneDrawingsReplaceOpDto {
  @Equals('scene.drawings.replace') type!: 'scene.drawings.replace';
  @IsArray() drawings!: unknown[];
}

export class SceneSoundsSetOpDto {
  @Equals('scene.sounds.set') type!: 'scene.sounds.set';
  @IsArray() @IsString({ each: true }) activeSoundIds!: string[];
}

/**
 * 10.2c-edit-7 — vyčistit scénu od všech tokenů (PC + NPC + bestie).
 * Idempotent: pokud scéna nemá tokeny, no-op. Pokud běží combat,
 * implicit ukončí (combat.end side-effect).
 *
 * Inverse = `scene.tokens.replace` (universal restore) se snapshot
 * předchozích tokenů + combat stavu.
 */
export class SceneTokensClearOpDto {
  @Equals('scene.tokens.clear') type!: 'scene.tokens.clear';
}

/**
 * 10.2c-edit-7 — universal replace všech tokenů (inverse pro `clear`).
 * Pole + optional combat snapshot.
 */
export class SceneTokensReplaceOpDto {
  @Equals('scene.tokens.replace') type!: 'scene.tokens.replace';
  @IsArray() tokens!: unknown[];
  @IsOptional()
  @IsObject()
  combat?: Record<string, unknown> | null;
}

/**
 * 10.2c-edit-7 — per-scéna whitelist Character.id (PC + NPC).
 * Spawn z palety probíhá jen z tohoto setu. PJ klikne `+ z katalogu`,
 * vybere postavu → `scene.activeCharacters.add`. `×` na řádce → `.remove`.
 *
 * Operace jsou idempotentní (add již-přítomné = no-op, remove
 * nepřítomného = no-op). Inverse vrací stav před.
 */
export class SceneActiveCharactersAddOpDto {
  @Equals('scene.activeCharacters.add')
  type!: 'scene.activeCharacters.add';
  @IsString() characterId!: string;
}

export class SceneActiveCharactersRemoveOpDto {
  @Equals('scene.activeCharacters.remove')
  type!: 'scene.activeCharacters.remove';
  @IsString() characterId!: string;
}

/**
 * 10.2c-edit-7 — per-scéna whitelist Bestie.id.
 * Stejný pattern jako activeCharacters.
 */
export class SceneActiveBestieAddOpDto {
  @Equals('scene.activeBestie.add') type!: 'scene.activeBestie.add';
  @IsString() bestieId!: string;
}

export class SceneActiveBestieRemoveOpDto {
  @Equals('scene.activeBestie.remove') type!: 'scene.activeBestie.remove';
  @IsString() bestieId!: string;
}

import { Equals, IsArray, IsString } from 'class-validator';

/**
 * 10.2-prep-1 — sound operations DTOs.
 * Spec: docs/arch/maps/operations/data-models.md § Sound operace.
 */

export class SoundPlaylistOpDto {
  @Equals('sound.playlist') type!: 'sound.playlist';
  @IsArray() @IsString({ each: true }) soundIds!: string[];
}

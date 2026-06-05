import { IsInt, Min, Max } from 'class-validator';

/**
 * 10.2-prep-1 — sdílené DTO helpery pro operations validace.
 *
 * F-22 — `q/r` range sjednocen s `token.add`/`token.move` (TokenPayloadDto):
 * `@IsInt() @Min(-10000) @Max(10000)`. Pokrývá `fog.brush` (hexes) i
 * `fog.set` (revealedHexes), které tento DTO sdílí.
 */

export class HexCoordDto {
  @IsInt() @Min(-10000) @Max(10000) q!: number;
  @IsInt() @Min(-10000) @Max(10000) r!: number;
}

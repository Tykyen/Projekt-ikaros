import { IsInt } from 'class-validator';

/**
 * 10.2-prep-1 — sdílené DTO helpery pro operations validace.
 */

export class HexCoordDto {
  @IsInt() q!: number;
  @IsInt() r!: number;
}

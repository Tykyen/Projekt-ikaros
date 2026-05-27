import {
  Equals,
  IsBoolean,
  IsIn,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { HexCoordDto } from './base';

/**
 * 10.2-prep-1 — fog operations DTOs.
 * Spec: docs/arch/maps/operations/data-models.md § Fog operace.
 */

export class FogSetOpDto {
  @Equals('fog.set') type!: 'fog.set';
  @IsBoolean() enabled!: boolean;
  @IsArray()
  @ArrayMaxSize(50000)
  @ValidateNested({ each: true })
  @Type(() => HexCoordDto)
  revealedHexes!: HexCoordDto[];
}

export class FogBrushOpDto {
  @Equals('fog.brush') type!: 'fog.brush';
  @IsIn(['reveal', 'fog']) mode!: 'reveal' | 'fog';
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => HexCoordDto)
  hexes!: HexCoordDto[];
}

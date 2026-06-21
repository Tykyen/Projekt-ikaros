import {
  Equals,
  IsString,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsArray,
  IsNumber,
  IsIn,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 15.4 — drawing (anotace na mapě) operations DTOs.
 *
 * Kresba = `line | arrow | circle | text` v map-space px (`points`), s barvou,
 * autorem a viditelností (`pj` = jen PJ, `all` = všichni). Persistováno v
 * `scene.drawings` (vzor `effects`).
 *
 * Pozn.: explicitní dekorátory na všech polích jsou POVINNÉ — globální
 * `ValidationPipe` (`whitelist: true`) jinak neoznačená pole tiše zahodí
 * (viz `EffectPayloadDto` poznámka).
 */
export class DrawingPayloadDto {
  @IsString() @IsNotEmpty() id!: string;
  @IsString() @IsIn(['line', 'arrow', 'circle', 'text']) kind!: string;
  /** map-space px páry `[x0,y0,x1,y1,...]`. */
  @IsArray() @IsNumber({}, { each: true }) points!: number[];
  @IsString() color!: string;
  @IsOptional() @IsString() text?: string;
  @IsString() @IsNotEmpty() createdByUserId!: string;
  @IsString() @IsIn(['pj', 'all']) visibility!: string;
  [key: string]: unknown;
}

export class DrawingAddOpDto {
  @Equals('drawing.add') type!: 'drawing.add';
  @IsObject()
  @ValidateNested()
  @Type(() => DrawingPayloadDto)
  drawing!: DrawingPayloadDto;
}

export class DrawingRemoveOpDto {
  @Equals('drawing.remove') type!: 'drawing.remove';
  @IsString() @IsNotEmpty() drawingId!: string;
}

export class DrawingClearOpDto {
  @Equals('drawing.clear') type!: 'drawing.clear';
}

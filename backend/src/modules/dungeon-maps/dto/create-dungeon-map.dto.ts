import {
  IsOptional,
  IsString,
  IsNumber,
  IsArray,
  IsIn,
  Min,
  Max,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';

// FIX-10 — class-validator dekorátory doplněny (vzor maps/dto/create-map.dto.ts).
// `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` bez metadat
// dropuje/odmítá všechna pole → dungeon-maps create byl reálně nefunkční (400).
// 21.3a — limity (grid max 100×100, decorations max 500) proti oversized payloadu.
// `ownerId` v DTO záměrně NENÍ — server-enforced z requestera (vzor MapTemplate).
export class CreateDungeonMapDto {
  @IsOptional() @IsString() worldId?: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsIn(['square', 'hex']) gridType?: 'square' | 'hex';
  @IsOptional() @IsNumber() @Min(10) @Max(100) gridWidth?: number;
  @IsOptional() @IsNumber() @Min(10) @Max(100) gridHeight?: number;
  @IsOptional() @IsNumber() @Min(8) @Max(100) cellSize?: number;
  @IsOptional() @IsIn(['dyson', 'modern']) theme?: 'dyson' | 'modern';
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  cells?: Record<string, unknown>[][];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  decorations?: Record<string, unknown>[];
}

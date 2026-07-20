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
import {
  MAP_KINDS,
  GRID_TYPES,
  DUNGEON_THEMES,
} from '../interfaces/dungeon-map.interface';
import type {
  MapKind,
  GridType,
  DungeonTheme,
} from '../interfaces/dungeon-map.interface';

// FIX-10 — class-validator dekorátory doplněny (vzor maps/dto/create-map.dto.ts).
// `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` bez metadat
// dropuje/odmítá všechna pole → dungeon-maps create byl reálně nefunkční (400).
// 21.3a — limity (grid max 100×100, decorations max 500) proti oversized payloadu.
// `ownerId` v DTO záměrně NENÍ — server-enforced z requestera (vzor MapTemplate).
export class CreateDungeonMapDto {
  @IsOptional() @IsString() worldId?: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  // 21.3e+g — druh mapy (jen při create; update ho nemá = žádná konverze).
  // D-077 — výčty ze sdílených konstant, ať nemůžou rozejít s toEntity/schematem.
  @IsOptional()
  @IsIn(MAP_KINDS)
  mapKind?: MapKind;
  @IsOptional() @IsIn(GRID_TYPES) gridType?: GridType;
  @IsOptional() @IsNumber() @Min(10) @Max(100) gridWidth?: number;
  @IsOptional() @IsNumber() @Min(10) @Max(100) gridHeight?: number;
  @IsOptional() @IsNumber() @Min(8) @Max(100) cellSize?: number;
  @IsOptional() @IsIn(DUNGEON_THEMES) theme?: DungeonTheme;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  cells?: Record<string, unknown>[][];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  decorations?: Record<string, unknown>[];
  // 21.3f — klíč mapy (popisy k popiskům).
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  notes?: Record<string, unknown>[];
}

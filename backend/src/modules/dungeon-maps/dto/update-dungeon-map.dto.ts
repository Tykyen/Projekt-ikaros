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
  GRID_TYPES,
  DUNGEON_THEMES,
} from '../interfaces/dungeon-map.interface';
import type {
  GridType,
  DungeonTheme,
} from '../interfaces/dungeon-map.interface';

// FIX-10 — class-validator dekorátory doplněny (vzor maps/dto/create-map.dto.ts).
// `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` bez metadat
// dropuje/odmítá všechna pole → dungeon-maps replace byl reálně nefunkční (400).
// 21.3a — limity shodné s CreateDungeonMapDto; ownerId server-enforced (mimo DTO).
export class UpdateDungeonMapDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  // D-077 — výčty ze sdílených konstant (mapKind tu záměrně NENÍ: druh mapy
  // se po založení nekonvertuje).
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
  // 21.3f — klíč mapy (popisy k popiskům) se edituje spolu s mapou.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  notes?: Record<string, unknown>[];
}

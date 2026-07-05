import { IsOptional, IsString, IsNumber, IsArray, IsIn } from 'class-validator';

// FIX-10 — class-validator dekorátory doplněny (vzor maps/dto/create-map.dto.ts).
// `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` bez metadat
// dropuje/odmítá všechna pole → dungeon-maps create byl reálně nefunkční (400).
export class CreateDungeonMapDto {
  @IsOptional() @IsString() worldId?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsIn(['square', 'hex']) gridType?: 'square' | 'hex';
  @IsOptional() @IsNumber() gridWidth?: number;
  @IsOptional() @IsNumber() gridHeight?: number;
  @IsOptional() @IsNumber() cellSize?: number;
  @IsOptional() @IsIn(['dyson', 'modern']) theme?: 'dyson' | 'modern';
  @IsOptional() @IsArray() cells?: Record<string, unknown>[][];
  @IsOptional() @IsArray() decorations?: Record<string, unknown>[];
}

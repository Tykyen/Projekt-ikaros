import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { UniverseNodeType } from '../interfaces/universe-map.interface';

const NODE_TYPES: UniverseNodeType[] = [
  'planet',
  'star',
  'nebula',
  'asteroid',
  'moon',
  'blackhole',
];

export class UniverseNodeDto {
  @IsString() id: string;
  @IsString() name: string;
  @IsOptional() @IsIn(NODE_TYPES) type?: UniverseNodeType;
  @IsString() color: string;
  @IsNumber() size: number;
  @IsOptional() @IsString() img?: string;
  @IsOptional() @IsString() alliance?: string;
  @IsOptional() @IsNumber() x?: number;
  @IsOptional() @IsNumber() y?: number;
  @IsOptional() @IsNumber() z?: number;
  @IsBoolean() isPublic: boolean;
  @IsArray() @IsString({ each: true }) visibleToPlayerIds: string[];
}

export class UniverseLinkDto {
  @IsString() source: string;
  @IsString() target: string;
  @IsBoolean() isOrbit: boolean;
}

export class UpdateUniverseDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UniverseNodeDto)
  nodes: UniverseNodeDto[];
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UniverseLinkDto)
  links: UniverseLinkDto[];
}

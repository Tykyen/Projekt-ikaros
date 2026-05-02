import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UniverseNodeDto {
  @IsString() id: string;
  @IsString() name: string;
  @IsOptional() @IsString() type?: string;
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
  @IsArray() @ValidateNested({ each: true }) @Type(() => UniverseNodeDto) nodes: UniverseNodeDto[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => UniverseLinkDto) links: UniverseLinkDto[];
}

import { IsOptional, IsArray, IsBoolean, IsObject, IsString, IsNumber, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class WorldCurrencyItemDto {
  @IsString() id: string;
  @IsString() code: string;
  @IsString() name: string;
  @IsString() symbol: string;
  @IsNumber() @Min(0) rate: number;
}

export class UpdateWorldSettingsDto {
  @IsOptional() @IsArray() hiddenNavItems?: string[];
  @IsOptional() @IsArray() customGroups?: string[];
  @IsOptional() @IsObject() groupColors?: Record<string, string>;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => WorldCurrencyItemDto) currencies?: WorldCurrencyItemDto[];
  @IsOptional() @IsBoolean() hideDefaultWeather?: boolean;
}

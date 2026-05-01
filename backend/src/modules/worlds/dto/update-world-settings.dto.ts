import { IsOptional, IsArray, IsBoolean, IsObject } from 'class-validator';
import { WorldCurrencyItem } from '../interfaces/world-settings.interface';

export class UpdateWorldSettingsDto {
  @IsOptional() @IsArray() hiddenNavItems?: string[];
  @IsOptional() @IsArray() customGroups?: string[];
  @IsOptional() @IsObject() groupColors?: Record<string, string>;
  @IsOptional() @IsArray() currencies?: WorldCurrencyItem[];
  @IsOptional() @IsBoolean() hideDefaultWeather?: boolean;
}

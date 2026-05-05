import { IsObject } from 'class-validator';

export class UpdateThemeDto {
  @IsObject()
  themeSettings: Record<string, unknown>;
}

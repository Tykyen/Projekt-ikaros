import { IsArray, IsBoolean, IsString } from 'class-validator';

export class UpdateNodeVisibilityDto {
  @IsBoolean() isPublic: boolean;
  @IsArray() @IsString({ each: true }) visibleToPlayerIds: string[];
}

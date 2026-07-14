import { IsOptional, IsString } from 'class-validator';

// 21.3c — cíl kopie: bez targetWorldId = moje osobní knihovna, s ním = svět.
export class CopyDungeonMapDto {
  @IsOptional() @IsString() targetWorldId?: string;
}

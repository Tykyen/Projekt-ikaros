import { IsString, IsNotEmpty } from 'class-validator';

export class CopyEmoteDto {
  @IsString()
  @IsNotEmpty()
  targetWorldId: string;
}

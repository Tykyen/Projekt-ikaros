import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

/** 20.5 — zpráva v konverzaci admin chatu (zatím jen text). */
export class CreatePlatformMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content!: string;
}

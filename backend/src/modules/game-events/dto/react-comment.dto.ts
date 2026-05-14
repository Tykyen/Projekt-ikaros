import { IsString, MaxLength, MinLength } from 'class-validator';

export class ReactCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  emoji!: string;
}

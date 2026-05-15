import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class AddPostDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  content: string;
}

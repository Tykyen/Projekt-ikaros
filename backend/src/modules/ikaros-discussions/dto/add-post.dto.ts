import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class AddPostDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  content: string;
}

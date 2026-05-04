import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateIkarosNewsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  content: string;
}

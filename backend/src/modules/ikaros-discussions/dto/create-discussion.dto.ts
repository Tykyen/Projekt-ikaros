import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateDiscussionDto {
  @IsString() @IsNotEmpty() @MaxLength(200)
  title: string;

  @IsString() @IsNotEmpty() @MaxLength(5000)
  description: string;
}

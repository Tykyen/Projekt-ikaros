import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class ReportPostDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}

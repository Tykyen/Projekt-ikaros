import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveIkarosMessageDto {
  @IsBoolean()
  accept: boolean;

  @IsOptional() @IsString() @MaxLength(1000)
  reason?: string;
}

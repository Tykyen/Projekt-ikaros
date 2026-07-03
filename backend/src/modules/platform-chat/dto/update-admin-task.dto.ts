import { IsString, MaxLength, IsOptional, IsBoolean } from 'class-validator';

/** 20.5 — úprava úkolu (text nebo odškrtnutí). */
export class UpdateAdminTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  text?: string;

  @IsOptional()
  @IsBoolean()
  done?: boolean;
}

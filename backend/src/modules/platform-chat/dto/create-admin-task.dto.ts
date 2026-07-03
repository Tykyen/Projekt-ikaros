import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';

/** 20.5 — nový úkol. `ownerId` použije jen superadmin (úkol cizímu adminovi). */
export class CreateAdminTaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  text!: string;

  @IsOptional()
  @IsString()
  ownerId?: string;
}

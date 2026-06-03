import { IsString, Matches, MinLength, MaxLength } from 'class-validator';

/** 1.3b (N-6b) — žádost o změnu username. Validace shodná s `RegisterDto`. */
export class RequestUsernameChangeDto {
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[^@]+$/, { message: 'Přezdívka nesmí obsahovat @' })
  newUsername: string;
}

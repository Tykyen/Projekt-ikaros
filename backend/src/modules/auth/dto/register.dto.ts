import {
  IsEmail,
  IsString,
  Matches,
  MinLength,
  MaxLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail() email: string;

  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[^@]+$/, { message: 'Přezdívka nesmí obsahovat @' })
  username: string;

  @IsString() @MinLength(6) @MaxLength(128) password: string;
}

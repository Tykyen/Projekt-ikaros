import { IsEmail } from 'class-validator';

/** D-NEW-INV-ADMIN-UI — admin (Superadmin) změna e-mailu uživatele. */
export class UpdateUserEmailDto {
  @IsEmail() email: string;
}

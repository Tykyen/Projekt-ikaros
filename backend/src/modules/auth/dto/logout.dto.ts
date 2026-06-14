import { IsString, IsOptional } from 'class-validator';

export class LogoutDto {
  // PC-18: refresh token primárně z httpOnly cookie; body je fallback (přechod).
  @IsOptional() @IsString() refreshToken?: string;
}

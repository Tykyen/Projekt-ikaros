import {
  IsBoolean,
  IsEmail,
  IsOptional,
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

  /**
   * F-03 (D-010 GDPR) — souhlas s podmínkami. FE ho vynucuje `refine(===true)`,
   * ale dosud chyběl v DTO → `whitelist` ho zahodil a BE souhlas nikde
   * nezaznamenal. Service ověří `=== true` a uloží `acceptedTermsAt` + `termsVersion`.
   */
  @IsBoolean()
  acceptedTerms: boolean;

  /**
   * D-011 — Cloudflare Turnstile token. Pro dev (test keys) vždy projde;
   * v produkci se musí ověřit přes siteverify endpoint Cloudflare.
   * Pole je optional pro zpětnou kompatibilitu (klient bez Turnstile widgetu
   * dostane verify=false → 400 v service).
   */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  captchaToken?: string;
}

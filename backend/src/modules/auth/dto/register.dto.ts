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

  // D-NEW-INV-SEC: sjednoceno na 8 (reset/změna hesla už 8) — registrace nesmí
  // povolit slabší heslo než reset. Existující účty neovlivněno (validuje jen
  // NOVÉ heslo; re-auth `PasswordConfirmDto` zůstává 6 kvůli legacy heslům).
  @IsString() @MinLength(8) @MaxLength(128) password: string;

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

  /**
   * D-011 — honeypot. FE pole `hp` je offscreen, skutečný uživatel ho nevidí
   * a posílá prázdný řetězec; bot ho vyplní → `@MaxLength(0)` vrátí 400.
   *
   * POZOR: musí být v DTO, protože `forbidNonWhitelisted` (PC-07) jinak každou
   * registraci s `hp:''` z FE odmítne 400 „Neznámé pole hp" → rozbitá registrace.
   * Symetrické s FE zod `hp: z.string().max(0)`.
   */
  @IsOptional()
  @IsString()
  @MaxLength(0, { message: 'Bot detection' })
  hp?: string;
}

import { IsString } from 'class-validator';

/** Spec 15.8 — žádost o guest session pro Hospodu (host). Captcha povinná. */
export class AnonSessionDto {
  @IsString()
  captchaToken: string;
}

import { IsString } from 'class-validator';

/** Spec 15.8 — Admin zabanuje hosta (anonyma) v Hospodě podle anon-id. */
export class AnonBanDto {
  @IsString()
  anonId: string;
}

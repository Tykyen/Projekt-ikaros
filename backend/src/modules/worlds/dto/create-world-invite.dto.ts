import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * 15.10 fáze B — vytvoření pozvánky do světa.
 *  - `kind='user'` → `invitedUserId` povinné (cílená pozvánka).
 *  - `kind='link'` → volitelně `expiresInDays` + `maxUses` (pozvací odkaz).
 * Role po přijetí je vždy Čtenář (server), proto ji DTO nenese.
 */
export class CreateWorldInviteDto {
  @IsIn(['user', 'link'])
  kind: 'user' | 'link';

  @IsOptional()
  @IsString()
  invitedUserId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  expiresInDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;
}

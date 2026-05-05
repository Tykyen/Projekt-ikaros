import { IsString } from 'class-validator';

export class RejectSoundDto {
  @IsString() reason: string;
}

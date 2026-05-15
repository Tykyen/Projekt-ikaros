import { IsBoolean } from 'class-validator';

export class ResolveJoinRequestDto {
  @IsBoolean()
  accept: boolean;
}

import { IsString, IsOptional, Matches } from 'class-validator';

export class CreateGameEventDto {
  @IsString()
  worldId: string;

  @IsString()
  title: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z?)?$/, {
    message: 'date musí být ve formátu ISO 8601',
  })
  date: string;

  @IsString()
  @IsOptional()
  description?: string;
}

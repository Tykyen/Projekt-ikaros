import { IsString, IsOptional, Matches, IsBoolean } from 'class-validator';

export class UpdateGameEventDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z?)?$/, {
    message: 'date musí být ve formátu ISO 8601',
  })
  date?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  reminderSent?: boolean;
}

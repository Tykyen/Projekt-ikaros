import { IsOptional, IsString, IsInt, IsIn, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import type { WorldNewsScope } from '../interfaces/world-news.interface';

export class QueryWorldNewsDto {
  @IsOptional()
  @IsString()
  worldId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  // 5.5b — offset paginace
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  // 5.5b — scope archivu; default 'active' řeší service
  @IsOptional()
  @IsIn(['active', 'archived', 'all'])
  scope?: WorldNewsScope;
}

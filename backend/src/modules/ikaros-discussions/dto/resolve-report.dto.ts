import { IsBoolean } from 'class-validator';

export class ResolveReportDto {
  /** True → nahlášený příspěvek se smaže; false → jen se report uzavře. */
  @IsBoolean()
  deletePost: boolean;
}

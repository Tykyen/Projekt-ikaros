import { IsString, IsObject, MinLength, MaxLength } from 'class-validator';

/**
 * 11.2-ext E — vstup pro POST `/scenario-templates`.
 * `ownerId` NENÍ ve DTO — server ho nastaví z auth user.
 */
export class CreateScenarioTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  scenarioTitle!: string;

  @IsObject()
  contentData!: Record<string, unknown>;
}

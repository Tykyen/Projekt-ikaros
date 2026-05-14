import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';

export class CreateGroupDto {
  @IsString() @MinLength(1) @MaxLength(64) name: string;
  @IsOptional() @IsNumber() @Min(0) order?: number;
}

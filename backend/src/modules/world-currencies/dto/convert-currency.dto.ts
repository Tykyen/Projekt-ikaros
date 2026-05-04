import { IsNumber, IsString, Min, MinLength } from 'class-validator';

export class ConvertCurrencyDto {
  @IsNumber() @Min(0) amount: number;
  @IsString() @MinLength(1) from: string;
  @IsString() @MinLength(1) to: string;
}

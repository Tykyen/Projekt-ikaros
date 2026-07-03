import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

/** 20.5 — přejmenování sdíleného dokumentu. */
export class RenameDocumentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  filename!: string;
}

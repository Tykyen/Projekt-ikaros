import { IsString } from 'class-validator';

// FIX-10 — class-validator dekorátory doplněny (vzor maps/dto/create-map.dto.ts).
export class ExportTemplateDto {
  @IsString() imageUrl!: string;
}

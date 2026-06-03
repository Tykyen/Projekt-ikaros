import { IsString } from 'class-validator';

/** 1.3c (N-6b) — self-delete; `confirmUsername` musí sedět s vlastní přezdívkou. */
export class RequestSelfDeletionDto {
  @IsString() confirmUsername: string;
}

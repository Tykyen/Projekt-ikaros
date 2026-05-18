import { IsString, IsNotEmpty } from 'class-validator';

/**
 * D-NEW-world-transfer — předání vlastnictví světa jinému členovi.
 * `newOwnerId` musí být userId existujícího člena světa.
 */
export class TransferWorldOwnershipDto {
  @IsString()
  @IsNotEmpty()
  newOwnerId: string;
}

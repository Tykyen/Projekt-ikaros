import {
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  IsString,
  IsEnum,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../users/interfaces/user.interface';

export class BulkRoleChangeDto {
  @ApiProperty({ description: 'User IDs, max 100' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  userIds: string[];

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role: UserRole;
}

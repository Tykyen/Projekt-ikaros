import { IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetAdminPermissionsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  canManageAdmins?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  canModerateContent?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  canEditPlatformPages?: boolean;
}

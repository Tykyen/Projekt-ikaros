import { IsArray, ArrayMaxSize, ArrayMinSize, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkUnbanDto {
  @ApiProperty({ description: 'User IDs, max 100' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  userIds: string[];
}

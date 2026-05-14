// backend/src/modules/world-weather/dto/broadcast-weather.dto.ts

import { IsIn, IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class BroadcastWeatherDto {
  @IsIn(['chat', 'map']) target: 'chat' | 'map';
  @IsString() @IsNotEmpty() @IsOptional() channelId?: string;
  @IsString() @IsOptional() mapId?: string;
}

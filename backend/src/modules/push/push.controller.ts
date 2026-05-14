import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PushService } from './push.service';
import { SubscribeDto, UnsubscribeDto } from './dto/subscribe.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../worlds/worlds.service';

@ApiTags('Push Notifications')
@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get('vapid-public-key')
  @ApiOperation({
    summary: 'VAPID public key pro web push subscriptions (veřejné)',
  })
  @ApiResponse({ status: 200 })
  getVapidPublicKey(): { publicKey: string } {
    return { publicKey: this.pushService.getPublicKey() };
  }

  @Post('subscribe')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Registrace push subscription (upsert dle endpoint)',
  })
  @ApiResponse({ status: 201 })
  async subscribe(@Body() dto: SubscribeDto, @CurrentUser() user: RequestUser) {
    return this.pushService.subscribe(user.id, dto);
  }

  @Post('unsubscribe')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Odhlášení push subscription' })
  @ApiResponse({ status: 200 })
  async unsubscribe(
    @Body() dto: UnsubscribeDto,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.pushService.unsubscribe(user.id, dto.endpoint);
  }
}

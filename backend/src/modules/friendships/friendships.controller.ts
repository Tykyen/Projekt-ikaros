import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FriendshipsService } from './friendships.service';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';

@ApiTags('Friends')
@ApiBearerAuth()
@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendshipsController {
  constructor(private readonly service: FriendshipsService) {}

  @Post('request')
  @ApiOperation({ summary: 'Pošli žádost o přátelství' })
  @ApiResponse({ status: 201 })
  sendRequest(
    @CurrentUser() user: RequestUser,
    @Body() dto: SendFriendRequestDto,
  ) {
    return this.service.sendRequest(user.id, dto.userId);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Akceptuj přátelství (jen recipient)' })
  accept(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.accept(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Recipient → reject pending (cool-down), jinak unfriend',
  })
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.service.removeOrDecline(user.id, id);
  }

  @Delete('by-user/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Smaž friendship podle ID partnera' })
  async removeByUser(
    @CurrentUser() user: RequestUser,
    @Param('userId') partnerId: string,
  ): Promise<void> {
    await this.service.removeByUser(user.id, partnerId);
  }

  @Get()
  @ApiOperation({ summary: 'Seznam aktivních přátel (accepted)' })
  list(
    @CurrentUser() user: RequestUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listForUser(
      user.id,
      page ? Number(page) : 1,
      limit ? Number(limit) : 50,
    );
  }

  @Get('status/:userId')
  @ApiOperation({ summary: 'Status vztahu s userId' })
  getStatus(
    @CurrentUser() user: RequestUser,
    @Param('userId') otherUserId: string,
  ) {
    return this.service.getStatus(user.id, otherUserId);
  }

  @Get('requests/outgoing')
  @ApiOperation({ summary: 'Moje odeslané pending žádosti' })
  listOutgoing(@CurrentUser() user: RequestUser) {
    return this.service.listOutgoing(user.id);
  }

  @Post('block/:userId')
  @ApiOperation({ summary: 'Zablokuj usera' })
  block(@CurrentUser() user: RequestUser, @Param('userId') blockedId: string) {
    return this.service.block(user.id, blockedId);
  }

  @Delete('block/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Odblokuj usera' })
  async unblock(
    @CurrentUser() user: RequestUser,
    @Param('userId') blockedId: string,
  ): Promise<void> {
    await this.service.unblock(user.id, blockedId);
  }

  @Get('blocks')
  @ApiOperation({ summary: 'Moje aktivní bloky' })
  listBlocks(@CurrentUser() user: RequestUser) {
    return this.service.listBlocks(user.id);
  }
}

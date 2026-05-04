import {
  Controller, Get, Post, Delete, Param, Body, UseGuards, HttpCode,
} from '@nestjs/common';
import { EmotesService } from './emotes.service';
import { CreateEmoteDto } from './dto/create-emote.dto';
import { CopyEmoteDto } from './dto/copy-emote.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/request-user.interface';

@Controller('emotes')
export class EmotesController {
  constructor(private readonly service: EmotesService) {}

  // ── Globální (musí být před /:worldId) ──────────────────────

  @Get('global')
  @UseGuards(JwtAuthGuard)
  findGlobal() {
    return this.service.findGlobal();
  }

  @Post('global')
  @UseGuards(JwtAuthGuard)
  async createGlobal(@Body() dto: CreateEmoteDto, @CurrentUser() user: RequestUser) {
    this.service.assertGlobalCanManage(user.role);
    return this.service.createGlobal(dto, user.id);
  }

  @Delete('global/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async deleteGlobal(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    this.service.assertGlobalCanManage(user.role);
    await this.service.deleteGlobal(id);
  }

  // ── Per-world ────────────────────────────────────────────────

  @Get(':worldId')
  @UseGuards(JwtAuthGuard)
  async findByWorld(@Param('worldId') worldId: string, @CurrentUser() user: RequestUser) {
    await this.service.assertIsMember(user.id, user.role, worldId);
    return this.service.findByWorld(worldId);
  }

  @Post(':worldId')
  @UseGuards(JwtAuthGuard)
  async create(
    @Param('worldId') worldId: string,
    @Body() dto: CreateEmoteDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertWorldCanManage(user.id, user.role, worldId);
    return this.service.create(worldId, dto, user.id);
  }

  @Delete(':worldId/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async deleteFromWorld(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertWorldCanManage(user.id, user.role, worldId);
    await this.service.deleteFromWorld(id, worldId);
  }

  @Post(':worldId/:id/copy')
  @UseGuards(JwtAuthGuard)
  async copy(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @Body() dto: CopyEmoteDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertWorldCanManage(user.id, user.role, worldId);
    await this.service.assertWorldCanManage(user.id, user.role, dto.targetWorldId);
    return this.service.copy(id, worldId, dto.targetWorldId, user.id);
  }
}

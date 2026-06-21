import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { EmotesService } from './emotes.service';
import type { CreateEmoteDto } from './dto/create-emote.dto';
import type { UpdateEmoteDto } from './dto/update-emote.dto';
import type { CopyEmoteDto } from './dto/copy-emote.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';

@ApiTags('Emotes')
@ApiBearerAuth()
@Controller('emotes')
export class EmotesController {
  constructor(private readonly service: EmotesService) {}

  // ── Globální (musí být před /:worldId) ──────────────────────

  @Get('global')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Globální emoty (worldId=null)' })
  @ApiResponse({ status: 200 })
  findGlobal() {
    return this.service.findGlobal();
  }

  @Post('global')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Vytvoření globálního emote (Admin+)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  async createGlobal(
    @Body() dto: CreateEmoteDto,
    @CurrentUser() user: RequestUser,
  ) {
    this.service.assertGlobalCanManage(user.role);
    return this.service.createGlobal(dto, user.id);
  }

  @Patch('global/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Update globálního emote (Admin+) — name / shortcode / image',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  async updateGlobal(
    @Param('id') id: string,
    @Body() dto: UpdateEmoteDto,
    @CurrentUser() user: RequestUser,
  ) {
    this.service.assertGlobalCanManage(user.role);
    return this.service.updateGlobal(id, dto);
  }

  @Delete('global/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @ApiOperation({ summary: 'Smazání globálního emote (Admin+)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  async deleteGlobal(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    this.service.assertGlobalCanManage(user.role);
    await this.service.deleteGlobal(id);
  }

  // ── Per-world ────────────────────────────────────────────────

  @Get(':worldId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Custom emoty světa (JWT, člen světa)' })
  @ApiResponse({ status: 200 })
  async findByWorld(
    @Param('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertIsMember(user, worldId);
    return this.service.findByWorld(worldId);
  }

  @Post(':worldId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Vytvoření emote (PJ/PomocnýPJ+)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  async create(
    @Param('worldId') worldId: string,
    @Body() dto: CreateEmoteDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertWorldCanManage(user, worldId);
    return this.service.create(worldId, dto, user.id);
  }

  @Patch(':worldId/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Update emote (PJ/PomocnýPJ+) — name / shortcode / image',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  async update(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @Body() dto: UpdateEmoteDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertWorldCanManage(user, worldId);
    return this.service.updateInWorld(id, worldId, dto);
  }

  @Delete(':worldId/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @ApiOperation({ summary: 'Smazání emote' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  async deleteFromWorld(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertWorldCanManage(user, worldId);
    await this.service.deleteFromWorld(id, worldId);
  }

  @Post(':worldId/:id/copy')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Kopírování emote do jiného světa' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  async copy(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @Body() dto: CopyEmoteDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertWorldCanManage(user, worldId);
    await this.service.assertWorldCanManage(user, dto.targetWorldId);
    return this.service.copy(id, worldId, dto.targetWorldId, user.id);
  }
}

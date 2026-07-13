/**
 * 21.5d — Riddles REST controller (hádanky). Community routy pod
 * `riddles/community/*` (statické segmenty před `:id` — parity s ostatními).
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';
import { RiddlesService } from './riddles.service';
import { RiddleCommentsService } from './riddle-comments.service';
import { CreateRiddleDto } from './dto/create-riddle.dto';
import { UpdateRiddleDto } from './dto/update-riddle.dto';
import { CreateRiddleCommentDto } from './dto/create-riddle-comment.dto';
import type { RiddleDifficulty } from './interfaces/riddle.interface';

interface RequestUser {
  id: string;
  username: string;
  role: UserRole;
}

@Controller('riddles')
@UseGuards(JwtAuthGuard)
export class RiddlesController {
  constructor(
    private readonly service: RiddlesService,
    private readonly commentsService: RiddleCommentsService,
  ) {}

  @Get('community')
  list(
    @Query('status') status: 'draft' | 'approved' | undefined,
    @Query('difficulty') difficulty: RiddleDifficulty | undefined,
    @Query('tag') tag: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.list({ status, difficulty, tag }, user);
  }

  @Get('community/:id')
  getOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.findById(id, user);
  }

  @Post('community')
  create(@Body() dto: CreateRiddleDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user);
  }

  /** Plná editace jádra (spec R5) — autor nebo kurátor. */
  @Patch('community/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRiddleDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(id, dto, user);
  }

  /** Kurátor schválí hádanku (přesun do schválené knihovny). */
  @Post('community/:id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.approve(id, user);
  }

  @Delete('community/:id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.remove(id, user);
  }

  // ─── Jednoúrovňová diskuse (spec R1) ───

  @Get('community/:id/comments')
  listComments(@Param('id') id: string) {
    return this.commentsService.list(id);
  }

  @Post('community/:id/comments')
  addComment(
    @Param('id') id: string,
    @Body() dto: CreateRiddleCommentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.commentsService.create(id, dto, user);
  }
}

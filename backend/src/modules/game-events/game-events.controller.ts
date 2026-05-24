import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { GameEventsService } from './game-events.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../worlds/worlds.service';
import { CreateGameEventDto } from './dto/create-game-event.dto';
import { UpdateGameEventDto } from './dto/update-game-event.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { ReactCommentDto } from './dto/react-comment.dto';
import { UpcomingQueryDto } from './dto/upcoming-query.dto';

@ApiTags('GameEvents')
@ApiBearerAuth()
@Controller('game-events')
@UseGuards(JwtAuthGuard)
export class GameEventsController {
  constructor(private readonly service: GameEventsService) {}

  @Get()
  @ApiOperation({ summary: 'Seznam herních eventů světa' })
  @ApiResponse({ status: 200, description: 'OK' })
  list(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId?: string,
    @Query('limit') limit?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    if (!worldId)
      throw new BadRequestException({
        code: 'WORLD_ID_REQUIRED',
        message: 'worldId query param je povinný',
      });
    return this.service.findList(
      {
        worldId,
        limit: limit ? parseInt(limit, 10) : undefined,
        fromDate,
        toDate,
      },
      user,
    );
  }

  @Get('upcoming/mine')
  @ApiOperation({
    summary: 'Blížící se eventy přihlášeného uživatele napříč jeho světy',
  })
  @ApiResponse({ status: 200, description: 'OK' })
  getUpcomingMine(
    @CurrentUser() user: RequestUser,
    @Query() query: UpcomingQueryDto,
  ) {
    return this.service.findUpcomingForUser(user, query.limit ?? 5);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail eventu' })
  detail(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.findById(id, user);
  }

  @Post()
  @ApiOperation({ summary: 'Vytvoření eventu (PJ/Admin)' })
  @ApiResponse({ status: 201, description: 'Vytvořeno' })
  create(@Body() dto: CreateGameEventDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Editace eventu (PJ/Admin)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateGameEventDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Smazání eventu (PJ/Admin)' })
  delete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.delete(id, user);
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: 'RSVP toggle účasti' })
  confirm(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.confirm(id, user);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Přidat komentář (root nebo reply na root)' })
  addComment(
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.addComment(id, dto, user);
  }

  @Patch(':id/comments/:commentId')
  @ApiOperation({ summary: 'Editovat vlastní komentář' })
  editComment(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.editComment(id, commentId, dto, user);
  }

  @Delete(':id/comments/:commentId')
  @ApiOperation({ summary: 'Soft delete komentáře (vlastní nebo PJ/Admin)' })
  deleteComment(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.deleteComment(id, commentId, user);
  }

  @Post(':id/comments/:commentId/react')
  @ApiOperation({ summary: 'Toggle reakce na komentář' })
  react(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @Body() dto: ReactCommentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.reactToComment(id, commentId, dto, user);
  }
}

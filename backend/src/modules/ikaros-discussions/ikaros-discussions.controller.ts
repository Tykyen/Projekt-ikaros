import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { IkarosDiscussionsService } from './ikaros-discussions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateDiscussionDto } from './dto/create-discussion.dto';
import { PatchDiscussionDto } from './dto/patch-discussion.dto';
import { RejectDiscussionDto } from './dto/reject-discussion.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { AddPostDto } from './dto/add-post.dto';
import { ResolveJoinRequestDto } from './dto/resolve-join-request.dto';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser {
  id: string;
  username: string;
  role: UserRole;
}

@ApiTags('Ikaros Discussions')
@ApiBearerAuth()
@Controller('ikaros-discussions')
@UseGuards(JwtAuthGuard)
export class IkarosDiscussionsController {
  constructor(private readonly service: IkarosDiscussionsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Schválené diskuze (+ pending pro admina). Volitelný `?offset&limit` paging.',
  })
  @ApiResponse({ status: 200 })
  findAll(
    @CurrentUser() user: RequestUser,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    // D-NEW-discussion-pagination — pokud `limit` zadaný, použij paged variant.
    if (limit !== undefined) {
      const offsetN = Math.max(0, Number(offset) || 0);
      const limitN = Math.min(200, Math.max(1, Number(limit) || 50));
      return this.service.findAllPaginated(
        user.id,
        user.role,
        user.username,
        offsetN,
        limitN,
      );
    }
    return this.service.findAll(user.id, user.role, user.username);
  }

  // D-DROBNE — statická routa MUSÍ být před `@Get(':id')` (pořadí rout).
  @Get('my')
  @ApiOperation({
    summary: 'Vlastní diskuze aktuálního uživatele (vč. pending)',
  })
  @ApiResponse({ status: 200 })
  findMy(@CurrentUser() user: RequestUser) {
    return this.service.findMy(user.id);
  }

  @Get('pending')
  @ApiOperation({ summary: 'Diskuze čekající na schválení' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  findPending(@CurrentUser() user: RequestUser) {
    return this.service.findPending(user.role, user.username);
  }

  @Get('my-favorites')
  @ApiOperation({ summary: 'Oblíbené diskuze aktuálního uživatele' })
  @ApiResponse({ status: 200 })
  findMyFavorites(@CurrentUser() user: RequestUser) {
    return this.service.findMyFavorites(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail diskuze' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'Diskuze nenalezena' })
  findById(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.findById(id, user.id, user.role, user.username);
  }

  @Post()
  @ApiOperation({ summary: 'Vytvoření diskuze' })
  @ApiResponse({ status: 201 })
  create(@Body() dto: CreateDiscussionDto, @CurrentUser() user: RequestUser) {
    return this.service.create(
      dto,
      user.id,
      user.username,
      user.role,
      user.username,
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editace diskuze (creator/manažer)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  patch(
    @Param('id') id: string,
    @Body() dto: PatchDiscussionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.patch(id, dto, user.id, user.role, user.username);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Schválení diskuze (Admin)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  approve(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.approve(id, user.role, user.username);
  }

  @Post(':id/reject')
  @HttpCode(204)
  @ApiOperation({ summary: 'Zamítnutí diskuze s důvodem' })
  @ApiResponse({ status: 204, description: 'Zamítnuto' })
  @ApiResponse({ status: 403 })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectDiscussionDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.reject(id, dto.reason, user.role, user.username);
  }

  @Post(':id/invite')
  @ApiOperation({ summary: 'Pozvání uživatele do diskuze (manager/admin)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  invite(
    @Param('id') id: string,
    @Body() dto: InviteUserDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.invite(
      id,
      dto.userId,
      user.id,
      user.role,
      user.username,
    );
  }

  @Post(':id/toggle-favorite')
  @ApiOperation({ summary: 'Toggle oblíbené diskuze' })
  @ApiResponse({ status: 200 })
  toggleFavorite(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.toggleFavorite(id, user.id);
  }

  @Post(':id/toggle-pin')
  @ApiOperation({ summary: 'Toggle připnutí diskuze do sidebaru (max 5)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 409, description: 'Není oblíbená / limit 5' })
  togglePin(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.togglePin(id, user.id);
  }

  @Post(':id/toggle-like')
  @ApiOperation({ summary: 'Toggle like diskuze' })
  @ApiResponse({ status: 200 })
  toggleLike(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.toggleLike(id, user.id);
  }

  @Post(':id/managers/:userId')
  @ApiOperation({ summary: 'Přidání správce diskuze (tvůrce/admin)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  addManager(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.addManager(
      id,
      userId,
      user.id,
      user.role,
      user.username,
    );
  }

  @Delete(':id/managers/:userId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Odebrání správce diskuze (tvůrce/admin)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  async removeManager(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.removeManager(
      id,
      userId,
      user.id,
      user.role,
      user.username,
    );
  }

  @Post(':id/join-request')
  @ApiOperation({ summary: 'Žádost o přidání do uzamčené diskuze' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: 'Diskuze je otevřená' })
  requestJoin(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.requestJoin(id, user.id, user.username);
  }

  @Post(':id/join-request/:userId/resolve')
  @ApiOperation({ summary: 'Vyřízení žádosti o přidání (manažer)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  resolveJoinRequest(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: ResolveJoinRequestDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.resolveJoinRequest(
      id,
      userId,
      dto.accept,
      user.id,
      user.role,
      user.username,
    );
  }

  // B4d — nahlašování příspěvků sjednoceno pod generický modul `moderation`
  // (`POST /moderation/reports` s targetType='discussion_post'); legacy
  // endpointy `POST :id/posts/:postId/report` a `POST reports/:reportId/resolve`
  // byly odstraněny.

  @Get(':id/members')
  @ApiOperation({ summary: 'Resolvovaní členové diskuze (manažer/admin)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  getMembers(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.getMembers(id, user.id, user.role, user.username);
  }

  @Get(':id/posts')
  @ApiOperation({ summary: 'Příspěvky diskuze (stránkované)' })
  @ApiResponse({ status: 200 })
  getPosts(
    @Param('id') id: string,
    @Query('skip') skip: string,
    @Query('limit') limit: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.getPosts(
      id,
      user.id,
      user.role,
      user.username,
      parseInt(skip ?? '0', 10),
      parseInt(limit ?? '50', 10),
    );
  }

  @Post(':id/posts')
  @ApiOperation({ summary: 'Přidání příspěvku' })
  @ApiResponse({ status: 201 })
  addPost(
    @Param('id') id: string,
    @Body() dto: AddPostDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.addPost(
      id,
      dto.content,
      user.id,
      user.username,
      user.role,
    );
  }

  @Delete(':id/posts/:postId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Smazání příspěvku' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  async deletePost(
    @Param('id') id: string,
    @Param('postId') postId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.deletePost(
      id,
      postId,
      user.id,
      user.role,
      user.username,
    );
  }
}

import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { CharactersService } from './characters.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateCharacterDto } from './dto/create-character.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';
import { ConvertCharacterDto } from './dto/convert-character.dto';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser { id: string; role: UserRole }

@Controller('worlds/:worldId/characters')
export class CharactersController {
  constructor(private readonly charactersService: CharactersService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Param('worldId') worldId: string) {
    return this.charactersService.findByWorld(worldId);
  }

  @Get('players')
  @UseGuards(JwtAuthGuard)
  getPlayerCharacters(@Param('worldId') worldId: string) {
    return this.charactersService.getPlayerCharacters(worldId);
  }

  @Get('directory')
  getDirectory(@Param('worldId') worldId: string) {
    return this.charactersService.getDirectory(worldId);
  }

  @Get('by-user/:userId')
  @UseGuards(JwtAuthGuard)
  findByUser(
    @Param('worldId') worldId: string,
    @Param('userId') userId: string,
  ) {
    return this.charactersService.findByUser(userId, worldId);
  }

  @Get(':slug')
  @UseGuards(JwtAuthGuard)
  findOne(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.charactersService.findBySlug(slug, worldId, user.id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Param('worldId') worldId: string,
    @Body() dto: CreateCharacterDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.charactersService.assertCanManage(user.id, user.role, worldId);
    return this.charactersService.create(dto, worldId);
  }

  @Patch(':slug')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @Body() dto: UpdateCharacterDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.charactersService.update(slug, worldId, dto, user);
  }

  @Patch(':slug/convert')
  @UseGuards(JwtAuthGuard)
  async convert(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @Body() dto: ConvertCharacterDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.charactersService.assertCanManage(user.id, user.role, worldId);
    return this.charactersService.convert(slug, worldId, dto);
  }

  @Delete(':slug')
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.charactersService.assertCanManage(user.id, user.role, worldId);
    return this.charactersService.delete(slug, worldId);
  }
}

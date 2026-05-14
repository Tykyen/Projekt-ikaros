import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Query,
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
import { MapsService } from './maps.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';
import { CreateMapDto } from './dto/create-map.dto';
import { MoveTokenDto } from './dto/move-token.dto';
import { RemoveTokenDto } from './dto/remove-token.dto';

interface RequestUser {
  id: string;
  role: UserRole;
}

@ApiTags('Maps')
@ApiBearerAuth()
@Controller('maps')
export class MapsController {
  constructor(private readonly service: MapsService) {}

  @ApiOperation({ summary: 'Scény světa' })
  @ApiResponse({ status: 200 })
  @Get()
  findByWorld(@Query('worldId') worldId: string) {
    return this.service.findByWorld(worldId);
  }

  @ApiOperation({ summary: 'Aktivní scéna světa' })
  @ApiResponse({ status: 200 })
  @Get('active')
  findActive(@Query('worldId') worldId: string) {
    return this.service.findActive(worldId);
  }

  @ApiOperation({ summary: 'Detail scény s characterData enrichmentem' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  @Get(':id')
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @ApiOperation({ summary: 'Vytvoření scény (PJ/Admin)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() dto: CreateMapDto, @CurrentUser() user: RequestUser) {
    const worldId = dto.worldId ?? '';
    await this.service.assertCanManage(user.id, user.role, worldId);
    return this.service.create(
      dto as unknown as Partial<
        import('./interfaces/map-scene.interface').MapScene
      >,
      worldId,
    );
  }

  @ApiOperation({ summary: 'Aktivace scény (deaktivuje ostatní v světě)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  @Post(':id/active')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async setActive(
    @Param('id') id: string,
    @Query('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user.id, user.role, worldId);
    await this.service.setActive(id, worldId);
  }

  @ApiOperation({ summary: 'Aktualizace scény' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async replace(
    @Param('id') id: string,
    @Body() dto: CreateMapDto,
    @CurrentUser() user: RequestUser,
  ) {
    const worldId = dto.worldId ?? '';
    await this.service.assertCanManage(user.id, user.role, worldId);
    return this.service.replace(
      id,
      dto as unknown as Partial<
        import('./interfaces/map-scene.interface').MapScene
      >,
    );
  }

  @ApiOperation({
    summary: 'Přesun tokenu na scéně (hráč jen svůj, PJ cokoliv)',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @Patch(':id/move-token')
  @UseGuards(JwtAuthGuard)
  moveToken(
    @Param('id') sceneId: string,
    @Body() dto: MoveTokenDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.moveToken(sceneId, dto, user.id, user.role);
  }

  @ApiOperation({ summary: 'Odebrání tokenu ze scény' })
  @ApiResponse({ status: 204, description: 'Token odebrán' })
  @ApiResponse({ status: 403 })
  @Patch(':id/remove-token')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async removeToken(
    @Param('id') sceneId: string,
    @Body() dto: RemoveTokenDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.removeToken(sceneId, dto.tokenId, user.id, user.role);
  }

  @ApiOperation({ summary: 'Smazání scény (PJ/Admin)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async delete(
    @Param('id') id: string,
    @Query('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user.id, user.role, worldId);
    await this.service.deleteScene(id);
  }
}

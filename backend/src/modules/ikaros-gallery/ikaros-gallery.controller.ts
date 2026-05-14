import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { IkarosGalleryService } from './ikaros-gallery.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateGalleryItemDto } from './dto/create-gallery-item.dto';
import { UpdateGalleryItemDto } from './dto/update-gallery-item.dto';
import { RateGalleryItemDto } from './dto/rate-gallery-item.dto';
import { RejectGalleryItemDto } from './dto/reject-gallery-item.dto';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser {
  id: string;
  username: string;
  role: UserRole;
}

@ApiTags('Ikaros Gallery')
@ApiBearerAuth()
@Controller('ikaros-gallery')
@UseGuards(JwtAuthGuard)
export class IkarosGalleryController {
  constructor(private readonly service: IkarosGalleryService) {}

  @Get()
  @ApiOperation({ summary: 'Schválené obrázky galerie' })
  @ApiResponse({ status: 200 })
  findAll(@CurrentUser() user: RequestUser) {
    return this.service.findAll(user.role, user.username);
  }

  @Get('my')
  @ApiOperation({ summary: 'Vlastní obrázky aktuálního uživatele' })
  @ApiResponse({ status: 200 })
  findMy(@CurrentUser() user: RequestUser) {
    return this.service.findMy(user.id);
  }

  @Get('pending')
  @ApiOperation({ summary: 'Obrázky čekající na schválení (Admin)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  findPending(@CurrentUser() user: RequestUser) {
    return this.service.findPending(user.role, user.username);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail obrázku' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  findById(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.findById(id, user.id, user.role, user.username);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }),
  )
  @ApiOperation({ summary: 'Nahrání obrázku do galerie (multipart/form-data)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string' },
        description: { type: 'string' },
        submit: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 201 })
  create(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateGalleryItemDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.create(dto, file, user.id, user.username, user.role);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Editace title/description obrázku' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateGalleryItemDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(id, dto, user.id, user.role, user.username);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Smazání obrázku' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  async delete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.delete(id, user.id, user.role, user.username);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Odeslání ke schválení' })
  @ApiResponse({ status: 200 })
  submit(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.submit(id, user.id, user.role);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Schválení obrázku (Admin)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  approve(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.approve(id, user.role, user.username);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Zamítnutí obrázku s důvodem (Admin)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectGalleryItemDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.reject(id, dto.reason, user.role, user.username);
  }

  @Post(':id/rate')
  @ApiOperation({ summary: 'Hodnocení obrázku 1–5 hvězdiček' })
  @ApiResponse({ status: 200 })
  rate(
    @Param('id') id: string,
    @Body() dto: RateGalleryItemDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.rate(id, dto.stars, user.id, user.role);
  }
}

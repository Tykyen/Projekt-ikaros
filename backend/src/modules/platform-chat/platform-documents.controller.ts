import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { UserRole } from '../users/interfaces/user.interface';
import { PlatformDocumentsService } from './platform-documents.service';
import { RenameDocumentDto } from './dto/rename-document.dto';

/** 20.5 — sdílené PDF admin chatu. Čtení/upload = všichni admini; mazání gate v service. */
@ApiTags('platform-documents')
@Controller('admin-chat/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Superadmin, UserRole.Admin)
export class PlatformDocumentsController {
  constructor(private readonly service: PlatformDocumentsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) {
      throw new BadRequestException({
        code: 'PLATFORM_DOC_NO_FILE',
        message: 'Chybí soubor',
      });
    }
    return this.service.upload(file, user);
  }

  @Patch(':id')
  rename(
    @Param('id') id: string,
    @Body() dto: RenameDocumentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.rename(id, dto.filename, user);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.delete(id, user);
  }
}

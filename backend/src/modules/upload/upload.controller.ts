import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../worlds/worlds.service';
import { UserRole } from '../users/interfaces/user.interface';
import { UploadService } from './upload.service';
import { ChatService } from '../chat/chat.service';

@ApiTags('Upload')
@ApiBearerAuth()
@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    @Inject(forwardRef(() => ChatService))
    private readonly chatService: ChatService,
  ) {}

  @Post()
  // UM-10 — upload rate-limit (storage/DoS), přísnější než globální 100/min/IP.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({
    summary: 'Nahrání souboru na Cloudinary (image/video/document, max 50 MB)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Nahraný soubor' })
  @ApiResponse({
    status: 400,
    description: 'Nepodporovaný MIME typ nebo příliš velký soubor',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('channelId') channelId: string,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file)
      throw new BadRequestException({
        code: 'UPLOAD_FILE_REQUIRED',
        message: 'Soubor je povinný',
      });
    if (!channelId)
      throw new BadRequestException({
        code: 'UPLOAD_CHANNEL_ID_REQUIRED',
        message: 'channelId je povinné',
      });
    const channel = await this.chatService.findChannelForUpload(
      channelId,
      user.id,
    );
    return this.uploadService.uploadFile(file, channel.worldId!, channelId);
  }

  /**
   * 3.1b — generic image upload pro platformový obsah (novinky, akce).
   * Bez `channelId` (na rozdíl od `POST /upload`). Jen Admin/Superadmin.
   * Dostavba chybějícího endpointu ze spec 2.1b §4.2.
   */
  @Post('image')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({
    summary: 'Nahrání obrázku platformového obsahu (Admin/Superadmin)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, description: '{ url, publicId }' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  @ApiResponse({ status: 415, description: 'Nepodporovaný typ souboru' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    if (user.role > UserRole.Admin)
      throw new ForbiddenException({
        code: 'FORBIDDEN_PLATFORM_ROLE',
        message: 'Jen Admin/Superadmin',
      });
    if (!file)
      throw new BadRequestException({
        code: 'UPLOAD_FILE_REQUIRED',
        message: 'Soubor je povinný',
      });
    return this.uploadService.uploadImage(file);
  }

  /**
   * 3.3x — upload obrázku vkládaného do rich-text obsahu (TipTap editor
   * v článcích/novinkách). Bez admin gate — autor článku je běžný hráč.
   */
  @Post('content-image')
  // UM-10 — hlavní open-to-any vektor: rate-limit proti storage spamu.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({
    summary: 'Nahrání obrázku do rich-text obsahu (každý přihlášený)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, description: '{ url, publicId, width, height }' })
  @ApiResponse({ status: 415, description: 'Nepodporovaný typ souboru' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadContentImage(@UploadedFile() file: Express.Multer.File) {
    if (!file)
      throw new BadRequestException({
        code: 'UPLOAD_FILE_REQUIRED',
        message: 'Soubor je povinný',
      });
    return this.uploadService.uploadContentImage(file);
  }
}

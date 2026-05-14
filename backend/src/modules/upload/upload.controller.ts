import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UseFilters,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
import { UploadService } from './upload.service';
import { ChatService } from '../chat/chat.service';
import { MulterExceptionFilter } from './filters/multer-exception.filter';

@ApiTags('Upload')
@ApiBearerAuth()
@Controller('upload')
@UseGuards(JwtAuthGuard)
@UseFilters(MulterExceptionFilter)
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly chatService: ChatService,
  ) {}

  @Post()
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
    if (!file) throw new BadRequestException('Soubor je povinný');
    if (!channelId) throw new BadRequestException('channelId je povinné');
    const channel = await this.chatService.findChannelForUpload(
      channelId,
      user.id,
    );
    return this.uploadService.uploadFile(file, channel.worldId!, channelId);
  }
}

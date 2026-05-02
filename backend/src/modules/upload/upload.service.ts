import { Injectable, UnsupportedMediaTypeException, BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { v2 as cloudinary } from 'cloudinary';
import type { ChatAttachment } from '../chat/interfaces/chat-attachment.interface';

const ALLOWED_MIME_TYPES: Record<string, 'image' | 'video' | 'document'> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/svg+xml': 'image',
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/quicktime': 'video',
  'application/pdf': 'document',
  'text/plain': 'document',
  'text/markdown': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
};

function getResourceType(type: 'image' | 'video' | 'document'): 'image' | 'video' | 'raw' {
  if (type === 'image') return 'image';
  if (type === 'video') return 'video';
  return 'raw';
}

@Injectable()
export class UploadService {
  constructor(private readonly configService: ConfigService) {
    cloudinary.config({
      cloud_name: configService.get('CLOUDINARY_CLOUD_NAME'),
      api_key: configService.get('CLOUDINARY_API_KEY'),
      api_secret: configService.get('CLOUDINARY_API_SECRET'),
    });
  }

  async uploadFile(
    file: Express.Multer.File,
    worldId: string,
    channelId: string,
  ): Promise<ChatAttachment> {
    const type = ALLOWED_MIME_TYPES[file.mimetype];
    if (!type) {
      throw new UnsupportedMediaTypeException(`Nepodporovaný typ souboru: ${file.mimetype}`);
    }

    const resourceType = getResourceType(type);
    let result: { secure_url: string; public_id: string };

    try {
      result = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            { folder: `chat/${worldId}/${channelId}`, resource_type: resourceType },
            (err, res) => {
              if (err || !res) reject(err ?? new Error('Cloudinary: no response'));
              else resolve(res as { secure_url: string; public_id: string });
            },
          )
          .end(file.buffer);
      });
    } catch {
      throw new BadGatewayException('Chyba při nahrávání souboru na Cloudinary');
    }

    return {
      url: result.secure_url,
      publicId: result.public_id,
      type,
      mimeType: file.mimetype,
      filename: file.originalname,
      size: file.size,
    };
  }

  @OnEvent('chat.message.deleted')
  async handleMessageDeleted(payload: { attachments?: ChatAttachment[] }): Promise<void> {
    for (const att of payload.attachments ?? []) {
      try {
        await cloudinary.uploader.destroy(att.publicId, { resource_type: getResourceType(att.type) });
      } catch {
        console.error(`[UploadService] Failed to delete Cloudinary asset: ${att.publicId}`);
      }
    }
  }
}

import {
  Injectable,
  UnsupportedMediaTypeException,
  BadGatewayException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { v2 as cloudinary } from 'cloudinary';
import { writeFile, mkdir } from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
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
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'document',
};

/**
 * 4.3b — povolené typy příloh globálního chatu: obrázky + dokumenty, BEZ
 * videa (záměrné zúžení proti `ALLOWED_MIME_TYPES`).
 */
const GLOBAL_CHAT_ALLOWED_MIME: Record<string, 'image' | 'document'> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/svg+xml': 'image',
  'application/pdf': 'document',
  'text/plain': 'document',
  'text/markdown': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'document',
};

/** 3.3a — výsledek image uploadu vč. rozměrů (masonry). */
export interface UploadedImage {
  url: string;
  publicId: string;
  width: number;
  height: number;
}

function getResourceType(
  type: 'image' | 'video' | 'document',
): 'image' | 'video' | 'raw' {
  if (type === 'image') return 'image';
  if (type === 'video') return 'video';
  return 'raw';
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  /** Cloud name z `CLOUDINARY_URL` — pro validaci původu URL příloh (4.3b). */
  private cloudName = '';

  constructor(private readonly configService: ConfigService) {
    // `.env` drží jediný connection-string `CLOUDINARY_URL` (formát
    // `cloudinary://api_key:api_secret@cloud_name`). Parsujeme ho zde —
    // auto-detekce SDK by proběhla při importu modulu, dřív než ConfigModule
    // načte `.env`, takže by nezabrala.
    const url = configService.get<string>('CLOUDINARY_URL');
    if (!url) {
      this.logger.error('CLOUDINARY_URL chybí — upload nebude fungovat');
      return;
    }
    try {
      const parsed = new URL(url);
      this.cloudName = parsed.hostname;
      cloudinary.config({
        cloud_name: parsed.hostname,
        api_key: decodeURIComponent(parsed.username),
        api_secret: decodeURIComponent(parsed.password),
        secure: true,
      });
    } catch {
      this.logger.error(
        'CLOUDINARY_URL má neplatný formát — očekává se cloudinary://key:secret@cloud',
      );
    }
  }

  /**
   * 4.3b — základ Cloudinary URL tohoto účtu. `GlobalChatService` jím ověřuje,
   * že příloha v DTO opravdu pochází z našeho uploadu (ne podstrčená cizí URL).
   */
  getCloudinaryBaseUrl(): string {
    return `https://res.cloudinary.com/${this.cloudName}/`;
  }

  async uploadFile(
    file: Express.Multer.File,
    worldId: string,
    channelId: string,
  ): Promise<ChatAttachment> {
    const type = ALLOWED_MIME_TYPES[file.mimetype];
    if (!type) {
      throw new UnsupportedMediaTypeException(
        `Nepodporovaný typ souboru: ${file.mimetype}`,
      );
    }

    const resourceType = getResourceType(type);
    let result: { secure_url: string; public_id: string };

    try {
      result = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              folder: `chat/${worldId}/${channelId}`,
              resource_type: resourceType,
            },
            (err, res) => {
              if (err || !res)
                reject(
                  err instanceof Error
                    ? err
                    : new Error(err?.message ?? 'Cloudinary: no response'),
                );
              else resolve(res);
            },
          )
          .end(file.buffer);
      });
    } catch {
      throw new BadGatewayException(
        'Chyba při nahrávání souboru na Cloudinary',
      );
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

  /**
   * 4.3b — upload přílohy globálního chatu (Hospoda / Rozcestí). Oproti
   * `uploadFile` nepřijímá `worldId` (globální kanály ho nemají) a povoluje
   * jen obrázky + dokumenty (`GLOBAL_CHAT_ALLOWED_MIME`, bez videa).
   * Folder `global-chat/<room>` — `publicId` v něm pak slouží jako důkaz
   * původu při validaci zprávy.
   */
  async uploadGlobalChatFile(
    file: Express.Multer.File,
    room: string,
  ): Promise<ChatAttachment> {
    const type = GLOBAL_CHAT_ALLOWED_MIME[file.mimetype];
    if (!type) {
      throw new UnsupportedMediaTypeException(
        `Nepodporovaný typ souboru: ${file.mimetype}`,
      );
    }

    const resourceType: 'image' | 'raw' = type === 'image' ? 'image' : 'raw';
    let result: { secure_url: string; public_id: string };
    try {
      result = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            { folder: `global-chat/${room}`, resource_type: resourceType },
            (err, res) => {
              if (err || !res)
                reject(
                  err instanceof Error
                    ? err
                    : new Error(err?.message ?? 'Cloudinary: no response'),
                );
              else resolve(res);
            },
          )
          .end(file.buffer);
      });
    } catch {
      throw new BadGatewayException(
        'Chyba při nahrávání souboru na Cloudinary',
      );
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

  /**
   * 6.2b — upload přílohy světového chatu (`/svet/:slug/chat`). Stejné MIME a
   * limity jako globální chat, ale folder `world-chat/<worldId>/` — oddělený
   * od globálního uploadu (snadný cleanup při smazání světa).
   */
  async uploadWorldChatFile(
    file: Express.Multer.File,
    worldId: string,
  ): Promise<ChatAttachment> {
    const type = GLOBAL_CHAT_ALLOWED_MIME[file.mimetype];
    if (!type) {
      throw new UnsupportedMediaTypeException(
        `Nepodporovaný typ souboru: ${file.mimetype}`,
      );
    }

    const resourceType: 'image' | 'raw' = type === 'image' ? 'image' : 'raw';
    let result: { secure_url: string; public_id: string };
    try {
      result = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              folder: `world-chat/${worldId}`,
              resource_type: resourceType,
            },
            (err, res) => {
              if (err || !res)
                reject(
                  err instanceof Error
                    ? err
                    : new Error(err?.message ?? 'Cloudinary: no response'),
                );
              else resolve(res);
            },
          )
          .end(file.buffer);
      });
    } catch {
      throw new BadGatewayException(
        'Chyba při nahrávání souboru na Cloudinary',
      );
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

  /**
   * Sdílené jádro pro image upload do Cloudinary. Validuje MIME (jen image/*),
   * nahraje do zadané `folder`, vrací `{ url, publicId, width, height }`.
   *
   * 3.3a — návrat rozšířen o `width`/`height` (Cloudinary je vrací; galerie
   * je potřebuje pro masonry aspect-ratio bez layout-shiftu).
   */
  private async uploadImageToFolder(
    file: Express.Multer.File,
    folder: string,
  ): Promise<UploadedImage> {
    const allowedImageTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
    ];
    if (!allowedImageTypes.includes(file.mimetype)) {
      throw new UnsupportedMediaTypeException(
        `Nepodporovaný typ souboru: ${file.mimetype}`,
      );
    }

    let result: {
      secure_url: string;
      public_id: string;
      width?: number;
      height?: number;
    };
    try {
      result = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream({ folder, resource_type: 'image' }, (err, res) => {
            if (err || !res)
              reject(
                err instanceof Error
                  ? err
                  : new Error(err?.message ?? 'Cloudinary: no response'),
              );
            else resolve(res);
          })
          .end(file.buffer);
      });
    } catch (e) {
      // 10.2c-fix — disk storage fallback při Cloudinary outage/missing creds.
      // Soubory v `backend/uploads/<folder>/`, dostupné přes `/static/<folder>/...`.
      this.logger.warn(
        `Cloudinary upload selhal (folder=${folder}), používám disk fallback: ${
          e instanceof Error ? e.message : 'unknown'
        }`,
      );
      return this.saveImageToDisk(file, folder);
    }

    return {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width ?? 0,
      height: result.height ?? 0,
    };
  }

  /**
   * 10.2c-fix — disk storage fallback. Multer file → `backend/uploads/<folder>/`.
   * Vrátí URL přes `BACKEND_BASE_URL/static/...` (ServeStatic v main.ts).
   */
  private async saveImageToDisk(
    file: Express.Multer.File,
    folder: string,
  ): Promise<UploadedImage> {
    // 10.2c-edit-2 cleanup — dříve dynamic import; failed v jest env bez
    // --experimental-vm-modules. Static import je standardní + funguje v testech.
    const uploadsRoot = path.resolve(process.cwd(), 'uploads', folder);
    await mkdir(uploadsRoot, { recursive: true });

    const ext = file.mimetype.split('/')[1]?.replace('+xml', '') ?? 'bin';
    const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    const filepath = path.join(uploadsRoot, filename);
    await writeFile(filepath, file.buffer);

    const baseUrl =
      this.configService.get<string>('BACKEND_BASE_URL') ??
      'http://localhost:3000';
    return {
      url: `${baseUrl}/static/${folder}/${filename}`,
      publicId: `local:${folder}/${filename}`,
      width: 0,
      height: 0,
    };
  }

  /** Upload obrázku do galerie (folder `gallery`). */
  async uploadGalleryImage(file: Express.Multer.File): Promise<UploadedImage> {
    return this.uploadImageToFolder(file, 'gallery');
  }

  /**
   * 3.1b — generic image upload pro platformový obsah (novinky, akce).
   * Folder `platform`, jinak shodné s `uploadGalleryImage`.
   */
  async uploadImage(file: Express.Multer.File): Promise<UploadedImage> {
    return this.uploadImageToFolder(file, 'platform');
  }

  /**
   * 3.3x — upload obrázku vkládaného do rich-text obsahu (články, novinky).
   * Folder `content`. Dostupné každému přihlášenému (autor článku je hráč).
   */
  async uploadContentImage(file: Express.Multer.File): Promise<UploadedImage> {
    return this.uploadImageToFolder(file, 'content');
  }

  /**
   * 1.3a — upload avataru uživatele / postavy. Deterministický `public_id`
   * (`main`, overwrite) → každý nový upload přepíše předchozí, žádné orphan
   * assety v Cloudinary. `folderPath` např. `ikaros/users/<id>/avatar`.
   * `size` = cílová strana čtverce (transformace fill + auto gravity).
   */
  async uploadUserImage(
    file: Express.Multer.File,
    folderPath: string,
    size: number,
  ): Promise<{ url: string; publicId: string }> {
    const allowedImageTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
    ];
    if (!allowedImageTypes.includes(file.mimetype)) {
      throw new UnsupportedMediaTypeException(
        `Nepodporovaný typ souboru: ${file.mimetype}`,
      );
    }

    let result: { secure_url: string; public_id: string };
    try {
      result = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              folder: folderPath,
              public_id: 'main',
              overwrite: true,
              resource_type: 'image',
              format: 'webp',
              transformation: [
                { width: size, height: size, crop: 'fill', gravity: 'auto' },
              ],
            },
            (err, res) => {
              if (err || !res)
                reject(
                  err instanceof Error
                    ? err
                    : new Error(err?.message ?? 'Cloudinary: no response'),
                );
              else resolve(res);
            },
          )
          .end(file.buffer);
      });
    } catch {
      throw new BadGatewayException(
        'Chyba při nahrávání obrázku na Cloudinary',
      );
    }

    return { url: result.secure_url, publicId: result.public_id };
  }

  /**
   * 1.3a — smazání avataru. `publicId` je deterministicky `<folderPath>/main`
   * (viz `uploadUserImage`). Best-effort přes `deleteImage`.
   */
  async deleteUserImage(folderPath: string): Promise<void> {
    await this.deleteImage(`${folderPath}/main`);
  }

  /**
   * 3.3a — smazání Cloudinary image assetu (best-effort). Volá galerie
   * při delete obrázku. Chyba se jen loguje, nevyhazuje se výjimka.
   */
  async deleteImage(publicId: string): Promise<void> {
    if (!publicId) return;
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    } catch (err) {
      this.logger.error(`Failed to delete Cloudinary image: ${publicId}`, err);
    }
  }

  /**
   * 4.3b — best-effort smazání Cloudinary assetů příloh. Chyba se jen loguje
   * (úklid nesmí shodit mazání zprávy ani prune job).
   */
  async deleteAttachments(attachments: ChatAttachment[] = []): Promise<void> {
    for (const att of attachments) {
      try {
        await cloudinary.uploader.destroy(att.publicId, {
          resource_type: getResourceType(att.type),
        });
      } catch (err) {
        this.logger.error(
          `Failed to delete Cloudinary asset: ${att.publicId}`,
          err,
        );
      }
    }
  }

  @OnEvent('chat.message.deleted')
  async handleMessageDeleted(payload: {
    attachments?: ChatAttachment[];
  }): Promise<void> {
    await this.deleteAttachments(payload.attachments);
  }

  /**
   * 4.3b — smazaná zpráva globálního chatu (Admin delete). Global-chat emituje
   * `chat.global.message.deleted` (jiný event než světový chat) — bez tohoto
   * handleru by přílohy zůstaly osiřelé na Cloudinary.
   */
  @OnEvent('chat.global.message.deleted')
  async handleGlobalMessageDeleted(payload: {
    attachments?: ChatAttachment[];
  }): Promise<void> {
    await this.deleteAttachments(payload.attachments);
  }
}

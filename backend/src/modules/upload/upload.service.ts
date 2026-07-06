import {
  Injectable,
  UnsupportedMediaTypeException,
  BadGatewayException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { logError } from '../../common/logging/log-error.util';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { v2 as cloudinary } from 'cloudinary';
import { writeFile, mkdir, unlink } from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import type { ChatAttachment } from '../chat/interfaces/chat-attachment.interface';

const ALLOWED_MIME_TYPES: Record<string, 'image' | 'video' | 'document'> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  // UM-01 — `image/svg+xml` ZÁMĚRNĚ vynecháno: SVG nese spustitelný skript;
  // servírovaný přímou Cloudinary URL = hostování XSS/phishing obsahu pod účtem.
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
  // UM-01 — bez `image/svg+xml` (XSS vektor, viz ALLOWED_MIME_TYPES).
  'application/pdf': 'document',
  'text/plain': 'document',
  'text/markdown': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'document',
};

/**
 * UM-07 — magic-byte (file signature) ověření. `file.mimetype` přichází z
 * multipartu (klient-controlled), takže samotný MIME whitelist lze obejít
 * přejmenováním (`evil.html` jako `image/png`). Ověříme reálnou signaturu
 * bufferu. Typy bez deterministické signatury (`text/plain`, `text/markdown`)
 * se nekontrolují — legitimně nesou libovolný text.
 */
const MAGIC_SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) =>
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/gif': (b) => b.toString('ascii', 0, 3) === 'GIF',
  'image/webp': (b) =>
    b.toString('ascii', 0, 4) === 'RIFF' &&
    b.toString('ascii', 8, 12) === 'WEBP',
  'application/pdf': (b) => b.toString('ascii', 0, 4) === '%PDF',
  'video/mp4': (b) => b.toString('ascii', 4, 8) === 'ftyp',
  'video/quicktime': (b) => b.toString('ascii', 4, 8) === 'ftyp',
  'video/webm': (b) =>
    b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
  // msword (.doc) = OLE2 header; docx = ZIP (PK).
  'application/msword': (b) =>
    b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (
    b,
  ) => b[0] === 0x50 && b[1] === 0x4b, // PK
};

/**
 * Vyhodí `UnsupportedMediaTypeException`, pokud buffer neodpovídá deklarovanému
 * MIME (známe-li jeho signaturu). Volá se po MIME whitelist checku.
 */
function assertMagicBytes(file: Express.Multer.File): void {
  const check = MAGIC_SIGNATURES[file.mimetype];
  if (!check) return; // typ bez deterministické signatury (text/*)
  if (!file.buffer || file.buffer.length < 12 || !check(file.buffer)) {
    throw new UnsupportedMediaTypeException(
      `Obsah souboru neodpovídá deklarovanému typu ${file.mimetype}`,
    );
  }
}

/**
 * UM-14 (DoS) — pixel/rozměr strop proti dekompresní bombě. Malý vstupní
 * soubor může nést gigapixel canvas → OOM/CPU spike při dekódování/transformaci.
 * Cloudinary `c_limit` zmenší asset jen pokud přesahuje strop (menší nechá beze
 * změny → bezpečné pro běžné obrázky). 4000 px = generózní pro fotky i atlasy,
 * pod hranicí, kde dekódování ohrozí instanci.
 */
export const MAX_IMAGE_DIMENSION = 4000;

/** UM-14 — Cloudinary transformace stropu rozměru (sdílená image cesta). */
const LIMIT_DIMENSION_TRANSFORM = {
  width: MAX_IMAGE_DIMENSION,
  height: MAX_IMAGE_DIMENSION,
  crop: 'limit' as const,
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

  /**
   * UM-08 — ověří, že přílohy v DTO pocházejí z našeho uploadu (doména účtu +
   * povolený folder prefix, nebo disk fallback `local:`). Brání podstrčení cizí
   * `url` do zprávy. World chat (`sendMessage`) i naplánované zprávy ji volaly
   * bez kontroly; global chat má vlastní `validateAttachments` (i s počtem).
   */
  assertAttachmentsOrigin(
    attachments: { url: string; publicId: string; type: string }[] | undefined,
    allowedFolderPrefixes: string[],
  ): void {
    if (!attachments || attachments.length === 0) return;
    const base = this.getCloudinaryBaseUrl();
    for (const att of attachments) {
      const validType = att.type === 'image' || att.type === 'document';
      const fromCloud =
        att.url.startsWith(base) &&
        allowedFolderPrefixes.some((p) => att.publicId.startsWith(p));
      const fromDisk = att.publicId.startsWith('local:'); // disk fallback
      if (!validType || (!fromCloud && !fromDisk)) {
        throw new BadRequestException({
          code: 'CHAT_INVALID_ATTACHMENT',
          message:
            'Neplatná příloha — soubor musí být nahrán přes upload chatu',
        });
      }
    }
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
    assertMagicBytes(file); // UM-07

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
   * 4.3b — upload přílohy globálního chatu (Hospoda / Camp). Oproti
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

    assertMagicBytes(file); // UM-07
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
   * 20.5 — upload sdíleného PDF admin chatu. Jen PDF, `resource_type: 'raw'`,
   * folder `platform-docs`. Vrací `ChatAttachment` (url/publicId pro sklad).
   */
  async uploadPlatformDocument(
    file: Express.Multer.File,
  ): Promise<ChatAttachment> {
    if (file.mimetype !== 'application/pdf') {
      throw new UnsupportedMediaTypeException('Povolené jsou jen PDF soubory');
    }
    assertMagicBytes(file); // UM-07
    let result: { secure_url: string; public_id: string };
    try {
      result = await new Promise((resolve, reject) => {
        cloudinary.uploader
          // 20.5 — `upload_chunked_stream` (po částech) obchází ~10 MB limit
          // Cloudinary na jedno nahrání; multer strop je 30 MB, takže PDF do
          // 30 MB projde (5 dílů). `chunk_size` < 10 MB → každý díl pod limitem.
          // Malý soubor = jediný díl (žádná regrese proti `upload_stream`).
          .upload_chunked_stream(
            {
              folder: 'platform-docs',
              resource_type: 'raw',
              chunk_size: 6_000_000,
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
    } catch (err) {
      // 20.5 — DŘÍV `catch {}` zahazoval skutečnou Cloudinary chybu → klient
      // dostal jen mlhavé „502" a nešlo poznat proč (velikost / typ / nastavení
      // účtu). Zalogujeme plný error a vrátíme konkrétní hlášku (admin-only).
      // FIX-54 — syrová Cloudinary error hláška (může nést interní detaily
      // účtu/konfigurace) šla dřív přímo klientovi; detail zůstává jen v logu.
      logError(
        this.logger,
        'uploadPlatformDocument: Cloudinary raw selhal',
        err,
      );
      throw new BadGatewayException({
        code: 'PLATFORM_DOC_UPLOAD_FAILED',
        message: 'Nahrání souboru se nezdařilo',
      });
    }
    return {
      url: result.secure_url,
      publicId: result.public_id,
      type: 'document',
      mimeType: file.mimetype,
      // 20.5 — multer čte multipart `originalname` jako latin1; české názvy
      // se pak uloží jako mojibake (`prÃ¡vnÃ­`). Překódujeme zpět na UTF-8.
      filename: Buffer.from(file.originalname, 'latin1').toString('utf8'),
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

    assertMagicBytes(file); // UM-07
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
   * 20.5 — upload přílohy admin chatu (`/admin-chat`). Stejné MIME a limity jako
   * globální chat (obrázky + dokumenty, bez videa), folder
   * `platform-chat/<channelId>` — oddělený sklad + důkaz původu při validaci
   * zprávy (`assertAttachmentsOrigin`).
   */
  async uploadPlatformChatFile(
    file: Express.Multer.File,
    channelId: string,
  ): Promise<ChatAttachment> {
    const type = GLOBAL_CHAT_ALLOWED_MIME[file.mimetype];
    if (!type) {
      throw new UnsupportedMediaTypeException(
        `Nepodporovaný typ souboru: ${file.mimetype}`,
      );
    }

    assertMagicBytes(file); // UM-07
    const resourceType: 'image' | 'raw' = type === 'image' ? 'image' : 'raw';
    let result: { secure_url: string; public_id: string };
    try {
      result = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              folder: `platform-chat/${channelId}`,
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
    // UM-01 — bez `image/svg+xml` (XSS vektor).
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
    assertMagicBytes(file); // UM-07

    let result: {
      secure_url: string;
      public_id: string;
      width?: number;
      height?: number;
    };
    try {
      result = await new Promise((resolve, reject) => {
        cloudinary.uploader
          // UM-09 — `strip_profile` odstraní EXIF/GPS/ICC z uloženého assetu
          // (avatar je řešen webp+crop transformací; tahle cesta byla holá).
          // UM-14 — `c_limit` strop rozměru proti dekompresní bombě.
          .upload_stream(
            {
              folder,
              resource_type: 'image',
              transformation: [
                LIMIT_DIMENSION_TRANSFORM,
                { flags: 'strip_profile' },
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
    assertMagicBytes(file); // UM-07

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
   * CD-01/02/03 (cascade-delete audit) — z Cloudinary `secure_url` vytáhne
   * `public_id` pro `deleteImage`. Vrací `null` pro ne-Cloudinary URL (GDrive
   * fallback z migrace, externí odkazy) → ty se NEmají mazat. Odolné vůči
   * verznímu segmentu (`/v123/`) i příponě.
   */
  extractCloudinaryPublicId(url: string | null | undefined): string | null {
    if (!url || !url.includes('res.cloudinary.com')) return null;
    const afterUpload = url.split('/upload/')[1];
    if (!afterUpload) return null;
    const id = afterUpload
      .replace(/^v\d+\//, '') // odstraň verzní segment
      .replace(/\.[a-zA-Z0-9]+$/, ''); // odstraň příponu
    return id || null;
  }

  /**
   * CD-01/02/03 — best-effort smazání Cloudinary blobu podle URL (entity
   * ukládají jen `imageUrl`, ne `publicId`). Ne-Cloudinary URL (GDrive) ignoruje.
   */
  async deleteImageByUrl(url: string | null | undefined): Promise<void> {
    const publicId = this.extractCloudinaryPublicId(url);
    if (publicId) {
      await this.deleteImage(publicId);
      return;
    }
    // UM-06 — disk fallback bloby (`/static/<folder>/<file>`) Cloudinary extractor
    // míjí (vrací null) → bez tohohle by ležely v `uploads/` navždy.
    await this.deleteLocalImageByUrl(url);
  }

  /** UM-06 — best-effort smazání disk-fallback souboru podle `/static/` URL. */
  private async deleteLocalImageByUrl(
    url: string | null | undefined,
  ): Promise<void> {
    if (!url || !url.includes('/static/')) return;
    const rel = url.split('/static/')[1];
    if (!rel) return;
    const root = path.resolve(process.cwd(), 'uploads');
    const filepath = path.resolve(root, path.normalize(rel));
    // traversal guard — cesta musí zůstat uvnitř uploads/
    if (filepath !== root && !filepath.startsWith(root + path.sep)) return;
    try {
      await unlink(filepath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        logError(this.logger, `Failed to delete local image: ${rel}`, err);
      }
    }
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
      logError(
        this.logger,
        `Failed to delete Cloudinary image: ${publicId}`,
        err,
      );
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
        logError(
          this.logger,
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

  /**
   * 20.5 — smazaná zpráva admin chatu (platform-chat) → úklid příloh na
   * Cloudinary (jinak by osiřely, `platform-chat.service` je z DB nuluje).
   */
  @OnEvent('platform-chat.message.deleted')
  async handlePlatformChatMessageDeleted(payload: {
    attachments?: ChatAttachment[];
  }): Promise<void> {
    await this.deleteAttachments(payload.attachments);
  }

  /**
   * 1.3c (N-3) — hard cleanup účtu: smaž avatar + character-avatar soubory
   * z Cloudinary (GDPR, spec §4.4). Event-driven (žádný DI cron→upload cyklus).
   * Best-effort — chyba se loguje, hard-delete pipeline nezastaví.
   */
  @OnEvent('user.deletion.hardDeleted')
  async handleAccountHardDeleted(payload: { userId: string }): Promise<void> {
    const base = `ikaros/users/${payload.userId}`;
    await this.deleteUserImage(`${base}/avatar`);
    await this.deleteUserImage(`${base}/character`);
  }

  /**
   * CD-01 (cascade-delete audit) — smazaná stránka: úklid Cloudinary blobu
   * obrázku + všech obrázků galerie. Ne-Cloudinary URL (GDrive) se ignorují
   * (`deleteImageByUrl` vrátí brzy). Best-effort.
   */
  @OnEvent('page.deleted')
  async handlePageDeleted(payload: {
    imageUrl?: string | null;
    galleryUrls?: string[];
  }): Promise<void> {
    await this.deleteImageByUrl(payload.imageUrl);
    for (const url of payload.galleryUrls ?? []) {
      await this.deleteImageByUrl(url);
    }
  }

  /**
   * CD-02 — smazaná postava: úklid avatar blobů (member.avatarUrl) na Cloudinary.
   */
  @OnEvent('character.avatars.removed')
  async handleCharacterAvatarsRemoved(payload: {
    urls?: string[];
  }): Promise<void> {
    for (const url of payload.urls ?? []) {
      await this.deleteImageByUrl(url);
    }
  }

  /**
   * CD-03 — smazaný svět (hard-delete): úklid world image blobu na Cloudinary.
   */
  @OnEvent('world.image.removed')
  async handleWorldImageRemoved(payload: { url?: string }): Promise<void> {
    await this.deleteImageByUrl(payload.url);
  }

  /**
   * UM-03/04/05 — generický úklid osiřelých blobů po REPLACE/edit (starý obrázek
   * entity, který už nikdo nereferencuje). Doplňuje delete-cesty (`*.deleted`),
   * jež řešily jen smazání celé entity, ne výměnu obrázku. Best-effort; ne-Cloudinary
   * (GDrive) URL `deleteImageByUrl` ignoruje, disk-fallback řeší lokálně.
   */
  @OnEvent('media.orphaned')
  async handleMediaOrphaned(payload: {
    urls?: (string | null | undefined)[];
  }): Promise<void> {
    for (const url of payload.urls ?? []) {
      await this.deleteImageByUrl(url);
    }
  }
}

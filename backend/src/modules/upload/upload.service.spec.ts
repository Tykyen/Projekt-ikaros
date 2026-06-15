import { Test } from '@nestjs/testing';
import {
  UnsupportedMediaTypeException,
  BadGatewayException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { UploadService } from './upload.service';
import { v2 as cloudinary } from 'cloudinary';
import { writeFile, mkdir, unlink } from 'fs/promises';

// Mock fs/promises pro disk fallback test (saveImageToDisk) + UM-06 cleanup (unlink)
jest.mock('fs/promises', () => ({
  writeFile: jest.fn(),
  mkdir: jest.fn(),
  unlink: jest.fn(),
}));

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload_stream: jest.fn(),
      destroy: jest.fn(),
    },
  },
}));

// UM-07 — buffer s validní magic-byte hlavičkou dle MIME (jinak `assertMagicBytes`
// upload odmítne). Typy bez signatury (x-executable/zip) padají dřív na MIME whitelistu.
const magicHeader = (mimetype: string): Buffer => {
  const pad = (head: number[]): Buffer =>
    Buffer.concat([Buffer.from(head), Buffer.alloc(16)]);
  switch (mimetype) {
    case 'image/jpeg':
      return pad([0xff, 0xd8, 0xff]);
    case 'image/png':
      return pad([0x89, 0x50, 0x4e, 0x47]);
    case 'image/gif':
      return pad([0x47, 0x49, 0x46]);
    case 'image/webp':
      return Buffer.concat([
        Buffer.from('RIFF'),
        Buffer.alloc(4),
        Buffer.from('WEBP'),
        Buffer.alloc(8),
      ]);
    case 'application/pdf':
      return pad([0x25, 0x50, 0x44, 0x46]);
    case 'video/mp4':
    case 'video/quicktime':
      return Buffer.concat([
        Buffer.alloc(4),
        Buffer.from('ftyp'),
        Buffer.alloc(8),
      ]);
    case 'video/webm':
      return pad([0x1a, 0x45, 0xdf, 0xa3]);
    case 'application/msword':
      return pad([0xd0, 0xcf, 0x11, 0xe0]);
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return pad([0x50, 0x4b, 0x03, 0x04]);
    default:
      return Buffer.from('test-content-padding-0123456789');
  }
};

const makeFile = (mimetype: string, size = 1024): Express.Multer.File => ({
  mimetype,
  originalname: 'test-file.jpg',
  size,
  buffer: magicHeader(mimetype),
  fieldname: 'file',
  encoding: '7bit',
  stream: null as any,
  destination: '',
  filename: '',
  path: '',
});

describe('UploadService', () => {
  let service: UploadService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UploadService,
        {
          provide: ConfigService,
          useValue: {
            get: jest
              .fn()
              .mockReturnValue('cloudinary://test-key:test-secret@test-cloud'),
          },
        },
      ],
    }).compile();
    service = module.get(UploadService);
    jest.clearAllMocks();
  });

  it('should throw UnsupportedMediaTypeException for blocked MIME type', async () => {
    await expect(
      service.uploadFile(makeFile('application/x-executable'), 'world1', 'ch1'),
    ).rejects.toThrow(UnsupportedMediaTypeException);
  });

  it('should throw UnsupportedMediaTypeException for application/zip', async () => {
    await expect(
      service.uploadFile(makeFile('application/zip'), 'world1', 'ch1'),
    ).rejects.toThrow(UnsupportedMediaTypeException);
  });

  // UM-01 — image/svg+xml byl odebrán z whitelistu (stored-XSS přes <script> v SVG).
  // Regresní guard: kdyby se svg vrátilo do povolených MIME, tenhle test zčervená.
  it('UM-01 — odmítne image/svg+xml (XSS vektor, ven z whitelistu)', async () => {
    await expect(
      service.uploadFile(makeFile('image/svg+xml'), 'world1', 'ch1'),
    ).rejects.toThrow(UnsupportedMediaTypeException);
  });

  it('should upload image/jpeg and return ChatAttachment with type image', async () => {
    const mockWritable = { end: jest.fn() };
    (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
      (_opts, cb) => {
        cb(null, {
          secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/abc.jpg',
          public_id: 'chat/world1/ch1/abc',
        });
        return mockWritable;
      },
    );

    const result = await service.uploadFile(
      makeFile('image/jpeg'),
      'world1',
      'ch1',
    );

    expect(result.type).toBe('image');
    expect(result.url).toBe(
      'https://res.cloudinary.com/demo/image/upload/v1/abc.jpg',
    );
    expect(result.publicId).toBe('chat/world1/ch1/abc');
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.filename).toBe('test-file.jpg');
    expect(result.size).toBe(1024);
  });

  it('should upload video/mp4 and return ChatAttachment with type video', async () => {
    const mockWritable = { end: jest.fn() };
    (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
      (_opts, cb) => {
        cb(null, {
          secure_url:
            'https://res.cloudinary.com/demo/video/upload/v1/video.mp4',
          public_id: 'chat/world1/ch1/vid',
        });
        return mockWritable;
      },
    );

    const result = await service.uploadFile(
      makeFile('video/mp4'),
      'world1',
      'ch1',
    );
    expect(result.type).toBe('video');
  });

  it('should upload application/pdf and return ChatAttachment with type document', async () => {
    const mockWritable = { end: jest.fn() };
    (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
      (_opts, cb) => {
        cb(null, {
          secure_url: 'https://res.cloudinary.com/demo/raw/upload/v1/doc.pdf',
          public_id: 'chat/world1/ch1/doc',
        });
        return mockWritable;
      },
    );

    const result = await service.uploadFile(
      makeFile('application/pdf'),
      'world1',
      'ch1',
    );
    expect(result.type).toBe('document');
  });

  it('should throw BadGatewayException when Cloudinary returns error', async () => {
    const mockWritable = { end: jest.fn() };
    (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
      (_opts, cb) => {
        cb(new Error('Cloudinary unavailable'), null);
        return mockWritable;
      },
    );

    await expect(
      service.uploadFile(makeFile('image/png'), 'world1', 'ch1'),
    ).rejects.toThrow(BadGatewayException);
  });

  it('should call cloudinary.destroy for each attachment in handleMessageDeleted', async () => {
    (cloudinary.uploader.destroy as jest.Mock).mockResolvedValue({
      result: 'ok',
    });

    await service.handleMessageDeleted({
      attachments: [
        {
          publicId: 'chat/abc',
          type: 'image',
          url: 'https://example.com',
          mimeType: 'image/jpeg',
          filename: 'a.jpg',
          size: 100,
        },
        {
          publicId: 'chat/def',
          type: 'document',
          url: 'https://example.com',
          mimeType: 'application/pdf',
          filename: 'b.pdf',
          size: 200,
        },
      ],
    });

    expect(cloudinary.uploader.destroy).toHaveBeenCalledTimes(2);
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('chat/abc', {
      resource_type: 'image',
    });
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('chat/def', {
      resource_type: 'raw',
    });
  });

  it('should not throw when handleMessageDeleted receives empty attachments', async () => {
    await expect(service.handleMessageDeleted({})).resolves.not.toThrow();
    await expect(
      service.handleMessageDeleted({ attachments: [] }),
    ).resolves.not.toThrow();
  });

  it('should not throw when Cloudinary destroy fails (best-effort)', async () => {
    (cloudinary.uploader.destroy as jest.Mock).mockRejectedValue(
      new Error('Network error'),
    );

    await expect(
      service.handleMessageDeleted({
        attachments: [
          {
            publicId: 'chat/abc',
            type: 'image',
            url: '',
            mimeType: 'image/jpeg',
            filename: 'a.jpg',
            size: 100,
          },
        ],
      }),
    ).resolves.not.toThrow();
  });

  describe('extractCloudinaryPublicId (CD-01, CD-02, CD-03 — blob cleanup guard)', () => {
    it('Cloudinary URL → public_id (bez verze a přípony)', () => {
      expect(
        service.extractCloudinaryPublicId(
          'https://res.cloudinary.com/demo/image/upload/v1700000000/ikaros/pages/abc.webp',
        ),
      ).toBe('ikaros/pages/abc');
    });
    it('Cloudinary URL bez verze → public_id', () => {
      expect(
        service.extractCloudinaryPublicId(
          'https://res.cloudinary.com/demo/image/upload/ikaros/users/u1/avatar/main.webp',
        ),
      ).toBe('ikaros/users/u1/avatar/main');
    });
    it('GDrive / ne-Cloudinary URL → null (NESMÍ se mazat)', () => {
      expect(
        service.extractCloudinaryPublicId('https://drive.google.com/uc?id=XYZ'),
      ).toBeNull();
      expect(
        service.extractCloudinaryPublicId('https://example.com/x.png'),
      ).toBeNull();
    });
    it('null / undefined / prázdné → null', () => {
      expect(service.extractCloudinaryPublicId(null)).toBeNull();
      expect(service.extractCloudinaryPublicId(undefined)).toBeNull();
      expect(service.extractCloudinaryPublicId('')).toBeNull();
    });
  });

  describe('uploadGlobalChatFile (4.3b)', () => {
    it('uploads image to folder "global-chat/<room>"', async () => {
      const mockWritable = { end: jest.fn() };
      (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
        (opts, cb) => {
          expect(opts.folder).toBe('global-chat/hospoda');
          expect(opts.resource_type).toBe('image');
          cb(null, {
            secure_url: 'https://cdn/a.png',
            public_id: 'global-chat/hospoda/a',
          });
          return mockWritable;
        },
      );
      const result = await service.uploadGlobalChatFile(
        makeFile('image/png'),
        'hospoda',
      );
      expect(result.type).toBe('image');
      expect(result.publicId).toBe('global-chat/hospoda/a');
    });

    it('uploads document with resource_type "raw"', async () => {
      const mockWritable = { end: jest.fn() };
      (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
        (opts, cb) => {
          expect(opts.resource_type).toBe('raw');
          cb(null, {
            secure_url: 'https://cdn/d.pdf',
            public_id: 'global-chat/rozcesti-1/d',
          });
          return mockWritable;
        },
      );
      const result = await service.uploadGlobalChatFile(
        makeFile('application/pdf'),
        'rozcesti-1',
      );
      expect(result.type).toBe('document');
    });

    it('rejects video (not allowed in chat attachments)', async () => {
      await expect(
        service.uploadGlobalChatFile(makeFile('video/mp4'), 'hospoda'),
      ).rejects.toThrow(UnsupportedMediaTypeException);
    });

    it('rejects an unsupported MIME type', async () => {
      await expect(
        service.uploadGlobalChatFile(makeFile('application/zip'), 'hospoda'),
      ).rejects.toThrow(UnsupportedMediaTypeException);
    });
  });

  describe('getCloudinaryBaseUrl (4.3b)', () => {
    it('builds the account base URL from CLOUDINARY_URL', () => {
      expect(service.getCloudinaryBaseUrl()).toBe(
        'https://res.cloudinary.com/test-cloud/',
      );
    });
  });

  describe('handleGlobalMessageDeleted (4.3b)', () => {
    it('destroys Cloudinary assets of the deleted global message', async () => {
      (cloudinary.uploader.destroy as jest.Mock).mockResolvedValue({
        result: 'ok',
      });
      await service.handleGlobalMessageDeleted({
        attachments: [
          {
            publicId: 'global-chat/hospoda/a',
            type: 'image',
            url: 'https://res.cloudinary.com/test-cloud/x',
            mimeType: 'image/png',
            filename: 'a.png',
            size: 100,
          },
        ],
      });
      expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(
        'global-chat/hospoda/a',
        { resource_type: 'image' },
      );
    });
  });

  describe('uploadGalleryImage', () => {
    it('should upload image to folder "gallery"', async () => {
      const mockWritable = { end: jest.fn() };
      (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
        (opts, cb) => {
          expect(opts.folder).toBe('gallery');
          cb(null, {
            secure_url: 'https://cdn/g.jpg',
            public_id: 'gallery/g',
            width: 1200,
            height: 800,
          });
          return mockWritable;
        },
      );

      const result = await service.uploadGalleryImage(makeFile('image/jpeg'));
      expect(result).toEqual({
        url: 'https://cdn/g.jpg',
        publicId: 'gallery/g',
        width: 1200,
        height: 800,
      });
    });
  });

  describe('uploadImage (3.1b — generic platform image)', () => {
    it('should upload image/png to folder "platform" and return url + publicId', async () => {
      const mockWritable = { end: jest.fn() };
      (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
        (opts, cb) => {
          expect(opts.folder).toBe('platform');
          cb(null, {
            secure_url: 'https://cdn/n.png',
            public_id: 'platform/n',
            width: 640,
            height: 480,
          });
          return mockWritable;
        },
      );

      const result = await service.uploadImage(makeFile('image/png'));
      expect(result).toEqual({
        url: 'https://cdn/n.png',
        publicId: 'platform/n',
        width: 640,
        height: 480,
      });
    });

    it('should throw UnsupportedMediaTypeException for non-image file', async () => {
      await expect(
        service.uploadImage(makeFile('application/pdf')),
      ).rejects.toThrow(UnsupportedMediaTypeException);
    });
  });

  describe('uploadContentImage (3.3x — rich-text obsah)', () => {
    it('should upload image to folder "content"', async () => {
      const mockWritable = { end: jest.fn() };
      (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
        (opts, cb) => {
          expect(opts.folder).toBe('content');
          cb(null, {
            secure_url: 'https://cdn/c.jpg',
            public_id: 'content/c',
            width: 1000,
            height: 700,
          });
          return mockWritable;
        },
      );

      const result = await service.uploadContentImage(makeFile('image/jpeg'));
      expect(result).toEqual({
        url: 'https://cdn/c.jpg',
        publicId: 'content/c',
        width: 1000,
        height: 700,
      });
    });

    it('should throw UnsupportedMediaTypeException for non-image file', async () => {
      await expect(
        service.uploadContentImage(makeFile('application/pdf')),
      ).rejects.toThrow(UnsupportedMediaTypeException);
    });

    it('disk fallback při Cloudinary failu — vrátí lokální URL místo BadGatewayException', async () => {
      // 10.2c-fix — disk storage fallback (commit d6204923). Cloudinary down
      // → uloží na disk + vrátí /static URL. Dříve hodil BadGatewayException.
      const mockWritable = { end: jest.fn() };
      (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
        (_opts, cb) => {
          cb(new Error('down'), null);
          return mockWritable;
        },
      );
      (writeFile as jest.Mock).mockResolvedValue(undefined);
      (mkdir as jest.Mock).mockResolvedValue(undefined);

      const result = await service.uploadImage(makeFile('image/jpeg'));
      expect(result.url).toContain('/static/platform/');
      expect(result.publicId).toContain('local:platform/');
      expect(writeFile).toHaveBeenCalled();
      expect(mkdir).toHaveBeenCalled();
    });
  });

  // UM-09 — EXIF/GPS/ICC strip na content/galerie/platform cestě
  // (`uploadImageToFolder`). Bez `flags: strip_profile` se originál vč. metadat
  // (GPS hráčovy fotky = PII leak) uloží beze změny. Avatar cesta to řeší
  // vlastní webp+crop transformací (jiná metoda).
  describe('UM-09 — EXIF strip (strip_profile) na image-folder cestě', () => {
    const expectStripProfile = async (
      upload: () => Promise<unknown>,
    ): Promise<void> => {
      let capturedOpts: any;
      const mockWritable = { end: jest.fn() };
      (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
        (opts, cb) => {
          capturedOpts = opts;
          cb(null, {
            secure_url: 'https://cdn/x.jpg',
            public_id: 'x',
            width: 1,
            height: 1,
          });
          return mockWritable;
        },
      );
      await upload();
      expect(capturedOpts.transformation).toEqual(
        expect.arrayContaining([{ flags: 'strip_profile' }]),
      );
    };

    it('UM-09 — uploadContentImage předá strip_profile transformaci', async () => {
      await expectStripProfile(() =>
        service.uploadContentImage(makeFile('image/jpeg')),
      );
    });

    it('UM-09 — uploadGalleryImage předá strip_profile transformaci', async () => {
      await expectStripProfile(() =>
        service.uploadGalleryImage(makeFile('image/png')),
      );
    });

    it('UM-09 — uploadImage (platform) předá strip_profile transformaci', async () => {
      await expectStripProfile(() =>
        service.uploadImage(makeFile('image/webp')),
      );
    });
  });

  // UM-14 (DoS) — pixel/rozměr strop proti dekompresní bombě. Image-folder cesta
  // (`uploadImageToFolder`: content/galerie/platform) musí Cloudinaru předat
  // `c_limit` transformaci na max 4000×4000 → gigapixel canvas se zmenší dřív,
  // než ohrozí instanci. Strop je v JEDNÉ transformaci spolu se strip_profile.
  describe('UM-14 — pixel/rozměr strop (dekompresní bomba)', () => {
    const captureOpts = async (
      upload: () => Promise<unknown>,
    ): Promise<any> => {
      let capturedOpts: any;
      const mockWritable = { end: jest.fn() };
      (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
        (opts, cb) => {
          capturedOpts = opts;
          cb(null, {
            secure_url: 'https://cdn/x.jpg',
            public_id: 'x',
            width: 1,
            height: 1,
          });
          return mockWritable;
        },
      );
      await upload();
      return capturedOpts;
    };

    it('UM-14 — uploadContentImage předá c_limit strop 4000×4000', async () => {
      const opts = await captureOpts(() =>
        service.uploadContentImage(makeFile('image/jpeg')),
      );
      expect(opts.transformation).toEqual(
        expect.arrayContaining([{ width: 4000, height: 4000, crop: 'limit' }]),
      );
    });

    it('UM-14 — uploadGalleryImage předá c_limit strop', async () => {
      const opts = await captureOpts(() =>
        service.uploadGalleryImage(makeFile('image/png')),
      );
      expect(opts.transformation).toEqual(
        expect.arrayContaining([{ width: 4000, height: 4000, crop: 'limit' }]),
      );
    });

    it('UM-14 — uploadImage (platform) předá c_limit strop', async () => {
      const opts = await captureOpts(() =>
        service.uploadImage(makeFile('image/webp')),
      );
      expect(opts.transformation).toEqual(
        expect.arrayContaining([{ width: 4000, height: 4000, crop: 'limit' }]),
      );
    });
  });

  // UM-08 — origin guard příloh world-chatu / scheduled zpráv. Brání podstrčení
  // cizí `url` do zprávy (tracking/phishing odkaz). Příloha musí pocházet z
  // našeho Cloudinary účtu (doména + folder prefix) nebo disk fallbacku (local:).
  describe('UM-08 — assertAttachmentsOrigin (origin guard příloh)', () => {
    const base = 'https://res.cloudinary.com/test-cloud/';

    it('UM-08 — prázdné / undefined přílohy projdou', () => {
      expect(() =>
        service.assertAttachmentsOrigin(undefined, ['world-chat/']),
      ).not.toThrow();
      expect(() =>
        service.assertAttachmentsOrigin([], ['world-chat/']),
      ).not.toThrow();
    });

    it('UM-08 — příloha z našeho Cloudinary účtu + povolený folder projde', () => {
      expect(() =>
        service.assertAttachmentsOrigin(
          [
            {
              url: `${base}image/upload/v1/world-chat/w1/a.png`,
              publicId: 'world-chat/w1/a',
              type: 'image',
            },
          ],
          ['world-chat/'],
        ),
      ).not.toThrow();
    });

    it('UM-08 — disk fallback (local:) projde', () => {
      expect(() =>
        service.assertAttachmentsOrigin(
          [
            {
              url: 'http://x/static/world-chat/w1/a.png',
              publicId: 'local:world-chat/w1/a',
              type: 'image',
            },
          ],
          ['world-chat/'],
        ),
      ).not.toThrow();
    });

    it('UM-08 — cizí doména (podstrčená url) → BadRequestException', () => {
      expect(() =>
        service.assertAttachmentsOrigin(
          [
            {
              url: 'https://evil.com/track.png',
              publicId: 'world-chat/w1/a',
              type: 'image',
            },
          ],
          ['world-chat/'],
        ),
      ).toThrow(BadRequestException);
    });

    it('UM-08 — správná doména ale cizí folder prefix → BadRequestException', () => {
      expect(() =>
        service.assertAttachmentsOrigin(
          [
            {
              url: `${base}image/upload/v1/global-chat/x/a.png`,
              publicId: 'global-chat/x/a',
              type: 'image',
            },
          ],
          ['world-chat/'],
        ),
      ).toThrow(BadRequestException);
    });

    it('UM-08 — nepovolený typ (video) → BadRequestException', () => {
      expect(() =>
        service.assertAttachmentsOrigin(
          [
            {
              url: `${base}video/upload/v1/world-chat/w1/v.mp4`,
              publicId: 'world-chat/w1/v',
              type: 'video',
            },
          ],
          ['world-chat/'],
        ),
      ).toThrow(BadRequestException);
    });
  });

  // UM-03, UM-04, UM-05 — generický úklid osiřelých blobů po REPLACE/delete přes event
  // `media.orphaned`. Doplňuje `*.deleted` cesty, jež řešily jen smazání celé
  // entity, ne výměnu obrázku (pages hero/galerie, worlds, chat-group,
  // world-news, game-events, emotes, mapy, world-maps).
  describe('UM-03, UM-04, UM-05 — handleMediaOrphaned (media.orphaned event)', () => {
    it('UM-03, UM-04, UM-05 — smaže každý Cloudinary blob z payloadu', async () => {
      (cloudinary.uploader.destroy as jest.Mock).mockResolvedValue({
        result: 'ok',
      });
      await service.handleMediaOrphaned({
        urls: [
          'https://res.cloudinary.com/demo/image/upload/v1/ikaros/pages/old.webp',
          'https://res.cloudinary.com/demo/image/upload/v1/ikaros/worlds/bg.webp',
        ],
      });
      expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(
        'ikaros/pages/old',
        { resource_type: 'image' },
      );
      expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(
        'ikaros/worlds/bg',
        { resource_type: 'image' },
      );
    });

    it('UM-03, UM-04, UM-05 — ne-Cloudinary (GDrive) URL se NEmaže', async () => {
      await service.handleMediaOrphaned({
        urls: ['https://drive.google.com/uc?id=XYZ', null, undefined],
      });
      expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
    });

    it('UM-03, UM-04, UM-05 — prázdný payload neselže', async () => {
      await expect(service.handleMediaOrphaned({})).resolves.not.toThrow();
    });
  });

  // UM-06 — disk-fallback bloby (`/static/...`) Cloudinary extractor míjí
  // (vrací null) → bez lokálního cleanupu by ležely v uploads/ navždy.
  // `deleteImageByUrl` proto na ně volá unlink, s traversal guardem.
  describe('UM-06 — deleteLocalImageByUrl (disk fallback cleanup)', () => {
    it('UM-06 — /static/ URL → unlink lokálního souboru', async () => {
      (unlink as jest.Mock).mockResolvedValue(undefined);
      await service.deleteImageByUrl(
        'http://localhost:3000/static/platform/123-abc.jpg',
      );
      expect(unlink).toHaveBeenCalledTimes(1);
      const calledPath = (unlink as jest.Mock).mock.calls[0][0] as string;
      expect(calledPath).toContain('uploads');
      expect(calledPath).toContain('platform');
    });

    it('UM-06 — path traversal (../) NEsmaže soubor mimo uploads/', async () => {
      (unlink as jest.Mock).mockResolvedValue(undefined);
      await service.deleteImageByUrl(
        'http://localhost:3000/static/../../../etc/passwd',
      );
      expect(unlink).not.toHaveBeenCalled();
    });

    it('UM-06 — ENOENT (soubor neexistuje) je best-effort, neselže', async () => {
      (unlink as jest.Mock).mockRejectedValue(
        Object.assign(new Error('not found'), { code: 'ENOENT' }),
      );
      await expect(
        service.deleteImageByUrl('http://x/static/platform/gone.jpg'),
      ).resolves.not.toThrow();
    });
  });
});

import { Test } from '@nestjs/testing';
import {
  UnsupportedMediaTypeException,
  BadGatewayException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadService } from './upload.service';
import { v2 as cloudinary } from 'cloudinary';
import { writeFile, mkdir } from 'fs/promises';

// Mock fs/promises pro disk fallback test (saveImageToDisk)
jest.mock('fs/promises', () => ({
  writeFile: jest.fn(),
  mkdir: jest.fn(),
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

const makeFile = (mimetype: string, size = 1024): Express.Multer.File => ({
  mimetype,
  originalname: 'test-file.jpg',
  size,
  buffer: Buffer.from('test-content'),
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
});

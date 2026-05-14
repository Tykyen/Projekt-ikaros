import { Test } from '@nestjs/testing';
import {
  UnsupportedMediaTypeException,
  BadGatewayException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadService } from './upload.service';
import { v2 as cloudinary } from 'cloudinary';

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
          useValue: { get: jest.fn().mockReturnValue('test-value') },
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
});

import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppGateway } from './app.gateway';

describe('AppGateway', () => {
  let gateway: AppGateway;
  const mockServer = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AppGateway,
        { provide: EventEmitter2, useValue: new EventEmitter2() },
      ],
    }).compile();
    gateway = module.get(AppGateway);
    (gateway as unknown as { server: typeof mockServer }).server = mockServer;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});

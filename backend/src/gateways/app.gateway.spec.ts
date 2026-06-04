import { Test } from '@nestjs/testing';
import type { Socket } from 'socket.io';
import { AppGateway } from './app.gateway';
import { ChatService } from '../modules/chat/chat.service';

describe('AppGateway', () => {
  let gateway: AppGateway;
  const mockChatService = { canJoinChannelRoom: jest.fn() };
  const mockServer = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  };

  const mkClient = (userId?: string) =>
    ({
      id: 's1',
      data: { userId },
      join: jest.fn(),
      leave: jest.fn(),
    }) as unknown as Socket;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AppGateway,
        { provide: ChatService, useValue: mockChatService },
      ],
    }).compile();
    gateway = module.get(AppGateway);
    (gateway as unknown as { server: typeof mockServer }).server = mockServer;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  // R-04 — access gate na `room:join chat:{id}`
  it('chat: room — povolí join když má přístup', async () => {
    mockChatService.canJoinChannelRoom.mockResolvedValue(true);
    const client = mkClient('u1');
    const res = await gateway.handleJoinRoom('chat:ch1', client);
    expect(mockChatService.canJoinChannelRoom).toHaveBeenCalledWith(
      'ch1',
      'u1',
    );
    expect(res).toEqual({ event: 'room:joined', data: 'chat:ch1' });
    expect(
      (client as unknown as { join: jest.Mock }).join,
    ).toHaveBeenCalledWith('chat:ch1');
  });

  it('chat: room — odmítne join bez přístupu (R-04 leak fix)', async () => {
    mockChatService.canJoinChannelRoom.mockResolvedValue(false);
    const client = mkClient('u1');
    const res = await gateway.handleJoinRoom('chat:secret', client);
    expect(res).toEqual({ error: 'Nedostatečná oprávnění' });
    expect(
      (client as unknown as { join: jest.Mock }).join,
    ).not.toHaveBeenCalled();
  });

  it('world: room — chat access gate se neuplatní (N-8 počasí)', async () => {
    const client = mkClient('u1');
    const res = await gateway.handleJoinRoom('world:w1', client);
    expect(mockChatService.canJoinChannelRoom).not.toHaveBeenCalled();
    expect(res).toEqual({ event: 'room:joined', data: 'world:w1' });
  });

  it('neplatný formát roomy → error', async () => {
    const client = mkClient('u1');
    const res = await gateway.handleJoinRoom('špatně!', client);
    expect(res).toEqual({ error: 'Neplatný formát roomy' });
  });
});

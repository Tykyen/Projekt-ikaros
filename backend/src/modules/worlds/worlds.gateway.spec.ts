import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { WorldsGateway } from './worlds.gateway';

describe('WorldsGateway', () => {
  let gateway: WorldsGateway;
  const mockServer = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
  const mockJwt = { verify: jest.fn() };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        WorldsGateway,
        { provide: EventEmitter2, useValue: new EventEmitter2() },
        { provide: JwtService, useValue: mockJwt },
      ],
    }).compile();
    gateway = module.get(WorldsGateway);
    (gateway as unknown as { server: typeof mockServer }).server = mockServer;
    mockServer.to.mockClear();
    mockServer.emit.mockClear();
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  it('broadcasts world:updated to correct world room', () => {
    const world = { id: 'world1', name: 'Matrix' };
    gateway.handleWorldUpdated(world as never);
    expect(mockServer.to).toHaveBeenCalledWith('world:world1');
    expect(mockServer.emit).toHaveBeenCalledWith('world:updated', world);
  });

  it('emits world:access-requested to PJ owner room', () => {
    gateway.handleAccessRequested({
      accessRequestId: 'ar1',
      worldId: 'w1',
      worldName: 'Matrix',
      worldSlug: 'matrix',
      ownerId: 'pj1',
      requesterId: 'u2',
    });
    expect(mockServer.to).toHaveBeenCalledWith('user:pj1');
    expect(mockServer.emit).toHaveBeenCalledWith(
      'world:access-requested',
      expect.objectContaining({ accessRequestId: 'ar1', worldId: 'w1' }),
    );
  });

  it('emits world:access-approved to requester room', () => {
    gateway.handleAccessApproved({
      accessRequestId: 'ar1',
      worldId: 'w1',
      worldName: 'Matrix',
      worldSlug: 'matrix',
      requesterId: 'u2',
    });
    expect(mockServer.to).toHaveBeenCalledWith('user:u2');
    expect(mockServer.emit).toHaveBeenCalledWith(
      'world:access-approved',
      expect.objectContaining({ accessRequestId: 'ar1', worldId: 'w1' }),
    );
  });

  it('emits world:access-rejected to requester room', () => {
    gateway.handleAccessRejected({
      accessRequestId: 'ar1',
      worldId: 'w1',
      worldName: 'Matrix',
      requesterId: 'u2',
    });
    expect(mockServer.to).toHaveBeenCalledWith('user:u2');
    expect(mockServer.emit).toHaveBeenCalledWith(
      'world:access-rejected',
      expect.objectContaining({ accessRequestId: 'ar1', worldId: 'w1' }),
    );
  });

  it('emits world:access-cancelled to PJ owner room', () => {
    gateway.handleAccessCancelled({
      accessRequestId: 'ar1',
      worldId: 'w1',
      ownerId: 'pj1',
    });
    expect(mockServer.to).toHaveBeenCalledWith('user:pj1');
    expect(mockServer.emit).toHaveBeenCalledWith(
      'world:access-cancelled',
      expect.objectContaining({ accessRequestId: 'ar1', worldId: 'w1' }),
    );
  });
});

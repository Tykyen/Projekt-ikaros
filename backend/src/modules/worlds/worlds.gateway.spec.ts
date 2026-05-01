import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorldsGateway } from './worlds.gateway';

describe('WorldsGateway', () => {
  let gateway: WorldsGateway;
  const mockServer = { to: jest.fn().mockReturnThis(), emit: jest.fn() };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [WorldsGateway, { provide: EventEmitter2, useValue: new EventEmitter2() }],
    }).compile();
    gateway = module.get(WorldsGateway);
    (gateway as unknown as { server: typeof mockServer }).server = mockServer;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  it('should broadcast world:updated to correct room', () => {
    const world = { id: 'world1', name: 'Matrix' };
    gateway.handleWorldUpdated(world as never);
    expect(mockServer.to).toHaveBeenCalledWith('world:world1');
    expect(mockServer.emit).toHaveBeenCalledWith('world:updated', world);
  });
});

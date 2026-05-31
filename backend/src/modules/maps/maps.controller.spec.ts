import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MapsController } from './maps.controller';
import { UserRole } from '../users/interfaces/user.interface';
import type { MapScene } from './interfaces/map-scene.interface';

/**
 * 10.2c-edit-1 C2 — unit testy pro `GET /maps/:id` guard.
 *
 * E2E test pro celý maps controller dluh (mimo tento spec).
 */
describe('MapsController.findById — read access guard', () => {
  const sceneStub: MapScene = {
    id: 'scene1',
    worldId: 'world1',
    name: 'Test',
    imageUrl: '',
    config: { size: 40, originX: 0, originY: 0, showGrid: true },
    tokens: [],
    npcTemplates: [],
    effects: [],
    fogEnabled: false,
    revealedHexes: [],
    isActive: false,
    isHidden: false,
    isLocked: false,
    playerStates: [],
    activeSoundIds: [],
    activeCharacterIds: [],
    activeBestieIds: [],
  };

  const sa = { id: 'sa', role: UserRole.Superadmin };
  const player = { id: 'player1', role: UserRole.Hrac };

  const mockService = { findById: jest.fn() };
  const mockMapOps = {} as never;
  const mockAuthorizer = { assertCanReadScene: jest.fn() };
  const mockRepo = { findById: jest.fn() };

  const controller = new MapsController(
    mockService as never,
    mockMapOps,
    mockAuthorizer as never,
    mockRepo as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('vrátí 404 MAP_SCENE_NOT_FOUND když scéna neexistuje (ani neukáže auth fail)', async () => {
    mockRepo.findById.mockResolvedValue(null);
    const promise = controller.findById('xxx', player);
    await expect(promise).rejects.toThrow(NotFoundException);
    await expect(promise).rejects.toMatchObject({
      response: { code: 'MAP_SCENE_NOT_FOUND' },
    });
    expect(mockAuthorizer.assertCanReadScene).not.toHaveBeenCalled();
    expect(mockService.findById).not.toHaveBeenCalled();
  });

  it('volá assertCanReadScene s loaded scénou a aktuálním userem', async () => {
    mockRepo.findById.mockResolvedValue(sceneStub);
    mockAuthorizer.assertCanReadScene.mockResolvedValue(undefined);
    mockService.findById.mockResolvedValue({ ...sceneStub, enriched: true });

    await controller.findById('scene1', player);

    expect(mockAuthorizer.assertCanReadScene).toHaveBeenCalledWith(
      player,
      sceneStub,
    );
  });

  it('propaguje ForbiddenException z authorizeru (např. cizí scéna)', async () => {
    mockRepo.findById.mockResolvedValue(sceneStub);
    mockAuthorizer.assertCanReadScene.mockRejectedValue(
      new ForbiddenException({
        code: 'MAP_FORBIDDEN_OTHER_SCENE',
        message: 'Tuto scénu nemáš přiřazenou',
      }),
    );

    const promise = controller.findById('scene1', player);
    await expect(promise).rejects.toThrow(ForbiddenException);
    await expect(promise).rejects.toMatchObject({
      response: { code: 'MAP_FORBIDDEN_OTHER_SCENE' },
    });
    expect(mockService.findById).not.toHaveBeenCalled();
  });

  it('Sa projde — volá enriched service.findById', async () => {
    mockRepo.findById.mockResolvedValue(sceneStub);
    mockAuthorizer.assertCanReadScene.mockResolvedValue(undefined);
    mockService.findById.mockResolvedValue({ ...sceneStub, enriched: true });

    const result = await controller.findById('scene1', sa);

    expect(mockService.findById).toHaveBeenCalledWith('scene1');
    expect(result).toMatchObject({ enriched: true });
  });
});

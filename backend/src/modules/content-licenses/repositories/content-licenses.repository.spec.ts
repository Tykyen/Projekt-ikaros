import { MongoContentLicensesRepository } from './content-licenses.repository';
import type { CreateContentLicenseInput } from '../interfaces/content-license.interface';

/**
 * Spec 20D (D4) — verzování licenční karty: změna režimu = NOVÁ verze
 * (nový záznam, vyšší versionId), starý dokument se nepřepisuje.
 */
describe('MongoContentLicensesRepository — verzování', () => {
  const baseInput: CreateContentLicenseInput = {
    contentId: 'content-1',
    ownerUserId: 'user-1',
    publicAuthorName: 'Autor',
    licenseMode: 'private',
    cloneAllowed: false,
    derivativesAllowed: false,
    exportAllowed: false,
    aiOrigin: 'A0',
    thirdPartyStatus: 'none',
    attributionRequired: false,
    reviewStatus: 'pending',
    acceptedTermsVersion: '1.0',
  };

  function makeModel(latest: Record<string, unknown> | null, count: number) {
    const create = jest.fn((data: Record<string, unknown>) =>
      Promise.resolve({ toObject: () => ({ _id: 'generated-id', ...data }) }),
    );
    const model = {
      create,
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(latest ? [latest] : []),
            }),
          }),
        }),
      }),
      countDocuments: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue(count) }),
    };
    return { model, create };
  }

  it('create() založí verzi 1', async () => {
    const { model, create } = makeModel(null, 0);
    const repo = new MongoContentLicensesRepository(model as never);
    const result = await repo.create(baseInput);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ contentId: 'content-1', versionId: '1' }),
    );
    expect(result.versionId).toBe('1');
  });

  it('createNewVersion() vytvoří NOVOU verzi s vyšším versionId a přenese pole', async () => {
    const latestDoc = {
      _id: 'v1-id',
      versionId: '1',
      createdAtUtc: new Date('2026-01-01'),
      ...baseInput,
    };
    const { model, create } = makeModel(latestDoc, 1);
    const repo = new MongoContentLicensesRepository(model as never);

    const result = await repo.createNewVersion('content-1', {
      licenseMode: 'clone',
      cloneAllowed: true,
    });

    // Nová verze = insert (create), NE přepis staré.
    expect(create).toHaveBeenCalledTimes(1);
    const created = create.mock.calls[0][0];
    expect(created.versionId).toBe('2');
    expect(created.contentId).toBe('content-1');
    // Změna má přednost…
    expect(created.licenseMode).toBe('clone');
    expect(created.cloneAllowed).toBe(true);
    // …nezměněná pole se přenesou z předchozí verze.
    expect(created.ownerUserId).toBe('user-1');
    expect(created.aiOrigin).toBe('A0');
    // Identita/verzní pole staré verze se NEpřenášejí.
    expect(created._id).toBeUndefined();
    expect(result?.versionId).toBe('2');
  });

  it('createNewVersion() vrátí null, když karta neexistuje', async () => {
    const { model, create } = makeModel(null, 0);
    const repo = new MongoContentLicensesRepository(model as never);
    const result = await repo.createNewVersion('neznamy', {
      licenseMode: 'read',
    });
    expect(result).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
});

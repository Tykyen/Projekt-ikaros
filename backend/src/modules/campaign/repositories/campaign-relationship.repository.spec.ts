import { MongoCampaignRelationshipRepository } from './campaign-relationship.repository';

/**
 * Chrání proti field-dropu v `toEntity`: strana vztahu je v DB schemaless objekt,
 * ale mapper skládá výstup pole po poli — nová pole `valence`/`emotionTag` musí
 * být explicitně přenesena, jinak je GET tiše zahodí (11.1 emoční model).
 */
describe('MongoCampaignRelationshipRepository.toEntity', () => {
  function makeRepo(docs: unknown[]) {
    const exec = jest.fn().mockResolvedValue(docs);
    const lean = jest.fn().mockReturnValue({ exec });
    const sort = jest.fn().mockReturnValue({ lean });
    const find = jest.fn().mockReturnValue({ sort });
    return new MongoCampaignRelationshipRepository({
      find,
    } as unknown as ConstructorParameters<
      typeof MongoCampaignRelationshipRepository
    >[0]);
  }

  it('přenese valence a emotionTag z obou stran', async () => {
    const repo = makeRepo([
      {
        _id: 'rel1',
        worldId: 'w1',
        ownerId: 'u1',
        isShared: false,
        subjectAId: 'a',
        subjectBId: 'b',
        shared: {},
        sideA: { tone: 't', strength: 7, valence: -3, emotionTag: 'nenávist' },
        sideB: { strength: 5, valence: 3, emotionTag: 'láska' },
        status: 'crisis',
        priority: 4,
        storylineIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const [rel] = await repo.findMany({ worldId: 'w1' });
    expect(rel.sideA.valence).toBe(-3);
    expect(rel.sideA.emotionTag).toBe('nenávist');
    expect(rel.sideA.strength).toBe(7);
    expect(rel.sideB.valence).toBe(3);
    expect(rel.sideB.emotionTag).toBe('láska');
  });

  it('valence/emotionTag jsou undefined, když v dokumentu chybí (strength fallback 5)', async () => {
    const repo = makeRepo([
      {
        _id: 'rel2',
        worldId: 'w1',
        ownerId: 'u1',
        isShared: false,
        subjectAId: 'a',
        subjectBId: 'b',
        shared: {},
        sideA: { strength: 5 },
        sideB: {},
        status: 'active',
        priority: 3,
        storylineIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const [rel] = await repo.findMany({ worldId: 'w1' });
    expect(rel.sideA.valence).toBeUndefined();
    expect(rel.sideA.emotionTag).toBeUndefined();
    expect(rel.sideB.strength).toBe(5);
  });
});

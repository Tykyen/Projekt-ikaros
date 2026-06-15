import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FogBrushOpDto, FogSetOpDto } from './fog-ops.dto';
import { TokenAddOpDto, TokenMoveOpDto } from './token-ops.dto';

/** Sesbírej property názvy z chyb i nested children (kvůli `revealedHexes`/`hexes`/`token`). */
async function flatErrorProps(dto: object): Promise<string[]> {
  const errors = await validate(dto);
  const props: string[] = [];
  const walk = (es: typeof errors): void => {
    for (const e of es) {
      props.push(e.property);
      if (e.children?.length) walk(e.children);
    }
  };
  walk(errors);
  return props;
}

describe('Map operations q/r — F-22 (@IsInt + range -10000..10000)', () => {
  describe('fog.set (revealedHexes)', () => {
    const base = { type: 'fog.set', enabled: true };

    it('F-22 — přijme celočíselné q/r v rozsahu', async () => {
      const dto = plainToInstance(FogSetOpDto, {
        ...base,
        revealedHexes: [
          { q: 0, r: 0 },
          { q: -5, r: 10 },
        ],
      });
      expect(await flatErrorProps(dto)).toEqual([]);
    });

    it('F-22 — odmítne string q v revealedHexes', async () => {
      const dto = plainToInstance(FogSetOpDto, {
        ...base,
        revealedHexes: [{ q: '5', r: 0 }],
      });
      expect(await flatErrorProps(dto)).toContain('q');
    });

    it('F-22 — odmítne desetinné / mimo rozsah r', async () => {
      const dto = plainToInstance(FogSetOpDto, {
        ...base,
        revealedHexes: [{ q: 0, r: 1.5 }],
      });
      expect(await flatErrorProps(dto)).toContain('r');
      const dto2 = plainToInstance(FogSetOpDto, {
        ...base,
        revealedHexes: [{ q: 0, r: 20000 }],
      });
      expect(await flatErrorProps(dto2)).toContain('r');
    });
  });

  describe('fog.brush (hexes)', () => {
    const base = { type: 'fog.brush', mode: 'reveal' };

    it('F-22 — přijme validní hexes', async () => {
      const dto = plainToInstance(FogBrushOpDto, {
        ...base,
        hexes: [{ q: 1, r: 2 }],
      });
      expect(await flatErrorProps(dto)).toEqual([]);
    });

    it('F-22 — odmítne string r v hexes', async () => {
      const dto = plainToInstance(FogBrushOpDto, {
        ...base,
        hexes: [{ q: 1, r: 'x' }],
      });
      expect(await flatErrorProps(dto)).toContain('r');
    });
  });

  describe('token.add / token.move', () => {
    it('F-22 — token.move odmítne string q', async () => {
      const dto = plainToInstance(TokenMoveOpDto, {
        type: 'token.move',
        tokenId: 't1',
        q: '3',
        r: 0,
      });
      expect(await flatErrorProps(dto)).toContain('q');
    });

    it('F-22 — token.add (nested token) odmítne q mimo rozsah', async () => {
      const dto = plainToInstance(TokenAddOpDto, {
        type: 'token.add',
        token: {
          id: 't1',
          characterId: 'c1',
          characterSlug: 'slug',
          q: 99999,
          r: 0,
        },
      });
      expect(await flatErrorProps(dto)).toContain('q');
    });

    it('F-22 — token.add přijme validní celočíselné q/r', async () => {
      const dto = plainToInstance(TokenAddOpDto, {
        type: 'token.add',
        token: {
          id: 't1',
          characterId: 'c1',
          characterSlug: 'slug',
          q: 5,
          r: -5,
        },
      });
      expect(await flatErrorProps(dto)).toEqual([]);
    });
  });
});

import { BadRequestException } from '@nestjs/common';
import { OperationPayloadValidator } from './operation-payload-validator.service';

describe('OperationPayloadValidator', () => {
  const validator = new OperationPayloadValidator();

  describe('validateMapOp — happy paths', () => {
    it('akceptuje valid token.move', () => {
      const result = validator.validateMapOp({
        type: 'token.move',
        tokenId: 't1',
        q: 5,
        r: -2,
      });
      expect(result.type).toBe('token.move');
    });

    it('akceptuje valid token.remove', () => {
      const result = validator.validateMapOp({
        type: 'token.remove',
        tokenId: 't1',
      });
      expect(result.type).toBe('token.remove');
    });

    it('akceptuje valid fog.brush', () => {
      const result = validator.validateMapOp({
        type: 'fog.brush',
        mode: 'reveal',
        hexes: [{ q: 0, r: 0 }],
      });
      expect(result.type).toBe('fog.brush');
    });

    it('akceptuje valid combat.start', () => {
      const result = validator.validateMapOp({
        type: 'combat.start',
        orderTokenIds: ['t1', 't2'],
      });
      expect(result.type).toBe('combat.start');
    });

    it('akceptuje token.update s patch object', () => {
      const result = validator.validateMapOp({
        type: 'token.update',
        tokenId: 't1',
        patch: { currentHp: 3, injury: 2 },
      });
      expect(result.type).toBe('token.update');
    });

    it('akceptuje extra fields (forward compat — whitelist=false)', () => {
      const result = validator.validateMapOp({
        type: 'token.move',
        tokenId: 't1',
        q: 5,
        r: -2,
        extraField: 'budoucí pole',
      });
      expect(result.type).toBe('token.move');
    });
  });

  describe('validateMapOp — errors', () => {
    it('odmítne missing type', () => {
      expect(() => validator.validateMapOp({})).toThrow(BadRequestException);
    });

    it('odmítne unknown type', () => {
      expect(() => validator.validateMapOp({ type: 'token.xyz' })).toThrow(
        BadRequestException,
      );
    });

    it('odmítne missing args (token.move bez q)', () => {
      expect(() =>
        validator.validateMapOp({
          type: 'token.move',
          tokenId: 't1',
          r: 0,
        }),
      ).toThrow(BadRequestException);
    });

    it('odmítne wrong type (token.move s q jako string)', () => {
      expect(() =>
        validator.validateMapOp({
          type: 'token.move',
          tokenId: 't1',
          q: '5',
          r: 0,
        }),
      ).toThrow(BadRequestException);
    });

    it('odmítne fog.brush s invalid mode', () => {
      expect(() =>
        validator.validateMapOp({
          type: 'fog.brush',
          mode: 'xyz',
          hexes: [{ q: 0, r: 0 }],
        }),
      ).toThrow(BadRequestException);
    });

    it('odmítne fog.brush s empty hexes array', () => {
      expect(() =>
        validator.validateMapOp({
          type: 'fog.brush',
          mode: 'reveal',
          hexes: [],
        }),
      ).toThrow(BadRequestException);
    });

    it('odmítne fog.brush s 1001 hexes (over limit)', () => {
      const hexes = Array.from({ length: 1001 }, (_, i) => ({ q: i, r: 0 }));
      expect(() =>
        validator.validateMapOp({ type: 'fog.brush', mode: 'reveal', hexes }),
      ).toThrow(BadRequestException);
    });

    it('odmítne combat.start s empty orderTokenIds', () => {
      expect(() =>
        validator.validateMapOp({
          type: 'combat.start',
          orderTokenIds: [],
        }),
      ).toThrow(BadRequestException);
    });

    it('odmítne null vstup', () => {
      expect(() => validator.validateMapOp(null)).toThrow(BadRequestException);
    });

    it('odmítne primitiv (string)', () => {
      expect(() => validator.validateMapOp('hello')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('validateWorldOp', () => {
    it('akceptuje member.assignToScene', () => {
      const result = validator.validateWorldOp({
        type: 'member.assignToScene',
        userId: 'u1',
        sceneId: 's1',
      });
      expect(result.type).toBe('member.assignToScene');
    });

    it('akceptuje member.unassign', () => {
      const result = validator.validateWorldOp({
        type: 'member.unassign',
        userId: 'u1',
      });
      expect(result.type).toBe('member.unassign');
    });

    it('akceptuje member.bulkAssignToScene', () => {
      const result = validator.validateWorldOp({
        type: 'member.bulkAssignToScene',
        userIds: ['u1', 'u2'],
        sceneId: 's1',
      });
      expect(result.type).toBe('member.bulkAssignToScene');
    });

    it('odmítne unknown world type', () => {
      expect(() => validator.validateWorldOp({ type: 'token.move' })).toThrow(
        BadRequestException,
      );
    });

    it('odmítne member.bulkAssignToScene s empty userIds', () => {
      expect(() =>
        validator.validateWorldOp({
          type: 'member.bulkAssignToScene',
          userIds: [],
          sceneId: 's1',
        }),
      ).toThrow(BadRequestException);
    });
  });
});

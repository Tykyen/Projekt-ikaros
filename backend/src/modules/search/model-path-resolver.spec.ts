import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { resolveModelPath } from './model-path-resolver';

jest.mock('fs');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('resolveModelPath', () => {
  const cacheDir = '/tmp/model_cache';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('vrátí cestu z cache pokud soubor existuje', async () => {
    const url = 'https://example.com/model.onnx';
    const hash = crypto.createHash('sha256').update(url).digest('hex');
    const expectedPath = path.join(cacheDir, `${hash}.onnx`);
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);

    const result = await resolveModelPath(url, cacheDir);
    expect(result).toBe(expectedPath);
  });
});

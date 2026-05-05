import { ModelRuntime } from './model-runtime';

jest.mock('onnxruntime-node', () => ({
  InferenceSession: {
    create: jest.fn().mockResolvedValue({
      run: jest.fn().mockResolvedValue({
        sentence_embedding: { data: new Float32Array([0.6, 0.8]) },
      }),
    }),
  },
  Tensor: jest.fn().mockImplementation((type, data, dims) => ({ type, data, dims })),
}));

jest.mock('sentencepiece-js', () => {
  return jest.fn().mockImplementation(() => ({
    load: jest.fn().mockResolvedValue(undefined),
    encode: jest.fn().mockReturnValue([1, 2, 3]),
  }));
});

describe('ModelRuntime', () => {
  let runtime: ModelRuntime;

  beforeEach(async () => {
    runtime = new ModelRuntime({
      key: 'granite-107',
      onnxPath: '/cache/model.onnx',
      tokenizerPath: '/cache/tokenizer.model',
      dimension: 2,
      sequenceLength: 4,
    });
    await runtime.initialize();
  });

  it('embed — vrátí L2-normalizovaný vektor', async () => {
    const result = await runtime.embed('hello world');
    const norm = Math.sqrt(result.reduce((s, v) => s + v * v, 0));
    expect(Math.abs(norm - 1.0)).toBeLessThan(0.001);
  });

  it('embed — vrátí vektor správné délky', async () => {
    const result = await runtime.embed('hello world');
    expect(result).toHaveLength(2);
  });
});

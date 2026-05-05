import * as ort from 'onnxruntime-node';
import SentencePiece from 'sentencepiece-js';
import { Logger } from '@nestjs/common';

export interface ModelRuntimeConfig {
  key: string;
  onnxPath: string;
  tokenizerPath: string;
  dimension: number;
  sequenceLength: number;
}

export class ModelRuntime {
  private readonly logger: Logger;
  private session: ort.InferenceSession | null = null;
  private tokenizer: InstanceType<typeof SentencePiece> | null = null;

  constructor(private readonly config: ModelRuntimeConfig) {
    this.logger = new Logger(`ModelRuntime[${config.key}]`);
  }

  async initialize(): Promise<void> {
    this.logger.log('Načítám ONNX model...');
    this.session = await ort.InferenceSession.create(this.config.onnxPath);

    this.logger.log('Načítám tokenizer...');
    this.tokenizer = new SentencePiece();
    await this.tokenizer.load(this.config.tokenizerPath);
    this.logger.log('ModelRuntime inicializován.');
  }

  async embed(text: string): Promise<number[]> {
    if (!this.session || !this.tokenizer) {
      throw new Error(`ModelRuntime[${this.config.key}] není inicializován`);
    }

    const tokenIds: number[] = this.tokenizer.encode(text);
    const seq = this.config.sequenceLength;

    const inputIds = new Array<number>(seq).fill(1);
    const attentionMask = new Array<number>(seq).fill(0);
    const len = Math.min(tokenIds.length, seq);
    for (let i = 0; i < len; i++) {
      inputIds[i] = tokenIds[i];
      attentionMask[i] = 1;
    }

    const feeds: Record<string, ort.Tensor> = {
      input_ids: new ort.Tensor('int64', BigInt64Array.from(inputIds.map(BigInt)), [1, seq]),
      attention_mask: new ort.Tensor('int64', BigInt64Array.from(attentionMask.map(BigInt)), [1, seq]),
    };

    const results = await this.session.run(feeds);
    const outputKey = results['sentence_embedding'] ? 'sentence_embedding' : Object.keys(results)[0];
    const raw = Array.from(results[outputKey].data as Float32Array);

    return l2Normalize(raw);
  }

  get key(): string { return this.config.key; }
  get dimension(): number { return this.config.dimension; }
}

function l2Normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) return vector;
  return vector.map((v) => v / norm);
}

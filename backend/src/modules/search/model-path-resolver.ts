import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as https from 'https';
import * as http from 'http';
import { Logger } from '@nestjs/common';

const logger = new Logger('ModelPathResolver');

export async function resolveModelPath(
  url: string,
  cacheDir: string,
): Promise<string> {
  const hash = crypto.createHash('sha256').update(url).digest('hex');
  const ext = path.extname(new URL(url).pathname) || '.bin';
  const cached = path.join(cacheDir, `${hash}${ext}`);

  if (fs.existsSync(cached)) {
    logger.log(`Model cache hit: ${cached}`);
    return cached;
  }

  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  logger.log(`Downloading model from ${url} ...`);
  await downloadFile(url, cached);
  logger.log(`Model downloaded to ${cached}`);
  return cached;
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    let downloaded = 0;
    let total = 0;
    let lastLogPct = -1;

    proto
      .get(url, (res) => {
        total = parseInt(res.headers['content-length'] ?? '0', 10);
        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length;
          if (total > 0) {
            const pct = Math.floor((downloaded / total) * 100);
            const step = Math.floor(pct / 10) * 10;
            if (step > lastLogPct) {
              lastLogPct = step;
              logger.log(`Download progress: ${step}%`);
            }
          }
        });
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      })
      .on('error', (err) => {
        fs.unlink(dest, () => undefined);
        reject(err);
      });
  });
}

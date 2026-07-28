import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

// 자체 OCR — 외부 유료 API를 쓰지 않고 서버에 설치된 Tesseract 5(kor+eng)를 직접 돌린다.
//   설치: sudo apt-get install -y tesseract-ocr tesseract-ocr-kor tesseract-ocr-eng
//
// 네이버 '리뷰 쓰기 완료' 화면처럼 앱이 그려낸 글자는 사진 속 글자와 달라서
// 전처리 없이도 잘 읽힌다(실측: 1440x2553 다크모드 캡처 → 3.5초 / 88MB).
// 그래서 이미지 라이브러리 의존성 없이 파일 → tesseract → 텍스트로 끝낸다.

const BIN = process.env.PEED_TESSERACT || 'tesseract';
const TIMEOUT_MS = Number(process.env.PEED_OCR_TIMEOUT_MS || 25000);
const MAX_BYTES = 12 * 1024 * 1024;

/** 동시 실행 상한 — 램 1.8G 서버에서 OCR 한 번이 ~90MB를 쓴다. 넘치면 줄을 세운다. */
const MAX_PARALLEL = Number(process.env.PEED_OCR_PARALLEL || 2);
let running = 0;
const waiting: (() => void)[] = [];

function acquire(): Promise<void> {
  if (running < MAX_PARALLEL) {
    running += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}

function release(): void {
  const next = waiting.shift();
  if (next) {
    next();
    return;
  }
  running = Math.max(0, running - 1);
}

/** tesseract 가 설치돼 있는지 — 없으면 판독을 건너뛰고 수동 입력으로 흘린다. */
let installed: boolean | null = null;
export async function ocrAvailable(): Promise<boolean> {
  if (installed !== null) return installed;
  installed = await new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (v: boolean) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    try {
      const p = spawn(BIN, ['--version']);
      p.on('error', () => finish(false));
      p.on('close', (code) => finish(code === 0));
      setTimeout(() => {
        p.kill('SIGKILL');
        finish(false);
      }, 5000);
    } catch {
      finish(false);
    }
  });
  return installed;
}

export type ImageBytes = { buf: Buffer; ext: string };

/** data URL(base64) → 바이트. 형식이 아니거나 너무 크면 null. */
export function decodeDataUrl(dataUrl: string): ImageBytes | null {
  const m = String(dataUrl || '').match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!m) return null;
  let buf: Buffer;
  try {
    buf = Buffer.from(m[2], 'base64');
  } catch {
    return null;
  }
  if (!buf.length || buf.length > MAX_BYTES) return null;
  const ext = m[1].toLowerCase().split('/')[1].replace('jpeg', 'jpg').split('+')[0];
  return { buf, ext };
}

/** 바이트의 SHA-256 — 완전히 같은 파일을 다시 올린 경우를 잡는 지문. */
export function bytesHash(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 32);
}

/**
 * 이미지에서 글자를 뽑는다. 실패하면 빈 문자열(호출한 쪽이 수동 입력으로 흘린다).
 * psm 6 = "하나의 균일한 텍스트 블록" — 실측에서 psm 4 보다 이 화면에 잘 맞았다.
 */
export async function readText(image: ImageBytes): Promise<string> {
  if (!(await ocrAvailable())) return '';
  await acquire();
  const tmp = path.join(
    os.tmpdir(),
    `peed_ocr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}.${image.ext}`
  );
  try {
    await fs.promises.writeFile(tmp, image.buf);
    return await new Promise<string>((resolve) => {
      let out = '';
      let settled = false;
      const finish = (v: string) => {
        if (!settled) {
          settled = true;
          resolve(v);
        }
      };
      const p = spawn(BIN, [tmp, 'stdout', '-l', 'kor+eng', '--psm', '6'], {
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const timer = setTimeout(() => {
        try {
          p.kill('SIGKILL');
        } catch {
          // 이미 끝났다
        }
        finish(out);
      }, TIMEOUT_MS);
      p.stdout.on('data', (d) => {
        out += d.toString('utf8');
      });
      p.on('error', () => {
        clearTimeout(timer);
        finish('');
      });
      p.on('close', () => {
        clearTimeout(timer);
        finish(out);
      });
    });
  } catch {
    return '';
  } finally {
    release();
    fs.promises.unlink(tmp).catch(() => {});
  }
}

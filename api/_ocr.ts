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
// 25초로는 모자랐다. 실측(2026-08-14)에서 잘 읽힌 판(긴 변 2400)도 21초가 걸렸고,
// 그보다 큰 판은 25초에 걸려 **빈 문자열**로 돌아왔다 — 판독 실패가 아니라 시간 초과인데
// 호출한 쪽에서는 구분이 안 돼 '못 읽는 사진'으로 보였다. 실제 유저 제출 2건이 그랬다.
const TIMEOUT_MS = Number(process.env.PEED_OCR_TIMEOUT_MS || 45000);
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

/**
 * 사진에서 영수증만 남길 사각형. 0..1 비율로 받는다.
 *
 * 픽셀이 아니라 비율인 이유: 화면에 보이는 사진은 축소돼 있고 기기마다 크기가 달라서,
 * 픽셀로 주고받으면 어느 쪽 좌표계인지가 늘 헷갈린다. 비율이면 원본 해상도가 얼마든
 * 같은 뜻이고, 자르기는 서버가 원본에서 직접 한다(줄인 사본에서 자르면 그만큼 잃는다).
 */
export type CropBox = { x: number; y: number; w: number; h: number };

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

/* ---------------------------------------------------------------- 전처리 */

// 폰으로 찍은 사진은 대부분 EXIF 회전 플래그를 달고 온다. 갤러리·브라우저는 그 플래그를
// 반영해 똑바로 보여주지만 **tesseract 는 무시하고 생픽셀을 읽는다**. 그래서 화면에서는
// 멀쩡한 사진이 판독기에는 누워서 들어가고, 판독이 통째로 실패한다.
//   실측(2026-08-12): 4000x3000 영수증 사진을 그대로 넣으면 46초 걸려 전부 쓰레기.
//   같은 사진을 세워서 넣으면 사업자등록번호가 체크섬까지 통과했다.
// 이건 영수증만의 문제가 아니라 지금 쓰는 리뷰 캡처 인증에도 그대로 해당한다.
//
// 그래서 tesseract 에 넘기기 전에 ImageMagick 으로 ① EXIF 를 실제 픽셀에 적용하고
// ② 플래그를 지우고 ③ 회색조로 바꿔 대비를 편다.
//   설치: sudo apt-get install -y imagemagick
// 없으면 전처리를 건너뛴다 — 예전만큼은 읽히므로 서비스가 멈추지는 않는다.

const MAGICK = process.env.PEED_MAGICK || 'convert';

// 긴 변 상한 — **절대 함부로 낮추지 말 것.**
// 감열 영수증의 가는 획은 재샘플링에 극도로 약하다. 실측(2026-08-12)에서
// 1750x2700 을 1685x2600 으로 **96% 축소**했을 뿐인데 사업자등록번호 줄이
// 통째로 사라졌다(체크섬 통과 → 판독 실패). 축소는 이득이 없다.
//
// 속도 때문에 줄일 이유도 없다. 영수증만 담긴 1750x2700 은 tesseract 로 3초다.
// 예전에 잰 46초는 크기 탓이 아니라 4000x3000 **전체 프레임**에 배경(책상·손·옷)이
// 잔뜩 들어 있어서 후보 영역이 폭발한 탓이었다. 답은 축소가 아니라 크롭이고,
// 크롭은 촬영 화면의 가이드 프레임이 맡는다.
//
// 여기 상한은 병적으로 큰 입력(스캐너 원본 등)만 막는 안전장치다.
const MAX_EDGE = Number(process.env.PEED_OCR_MAX_EDGE || 4200);

// 다만 '줄이지 않는다' 를 폰 원본 사진에까지 적용한 것이 실서비스에서 탈이 났다.
// 위 실측은 **영수증만 담긴 crop** 을 줄였을 때의 이야기였는데, 유저가 실제로 올리는
// 것은 배경(책상·손·옷)까지 들어간 1200만 화소 원본이다. 거기서는 반대로 나온다.
//   실측(2026-08-14, 갤럭시 3000x4000 원본 2장):
//     긴 변 3000 → 두 장 다 신뢰도 0 (게다가 25초 초과)
//     긴 변 2400 → 0.72(사업자번호 체크섬 통과) / 0.42(전화·일시)
//     긴 변 1800 → 0.24 / 0.28
// 영수증 글자가 tesseract 가 좋아하는 크기보다 **너무 크면** 오히려 못 읽는다.
//
// 그래서 두 측정값 사이를 잇지 않고, 각각이 측정된 지점에 그대로 둔다.
//   · 800만 화소를 넘는 입력(= 폰 카메라 원본) → 긴 변 2400 으로 줄인다
//   · 그 이하(= 이미 잘라낸 영수증, 4.7백만 화소) → 손대지 않는다
const BIG_INPUT_PIXELS = Number(process.env.PEED_OCR_BIG_PIXELS || 8_000_000);
const PHOTO_EDGE = Number(process.env.PEED_OCR_PHOTO_EDGE || 2400);

let magickOk: boolean | null = null;
export async function preprocessAvailable(): Promise<boolean> {
  if (magickOk !== null) return magickOk;
  magickOk = await new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (v: boolean) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    try {
      const p = spawn(MAGICK, ['-version']);
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
  return magickOk;
}

/** 자식 프로세스를 돌리고 stdout 을 모은다. 실패·시간초과는 빈 값으로 흘린다. */
function run(bin: string, args: string[], timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    let out = '';
    let settled = false;
    const finish = (v: string | null) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    let p: ReturnType<typeof spawn>;
    try {
      p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      finish(null);
      return;
    }
    const timer = setTimeout(() => {
      try {
        p.kill('SIGKILL');
      } catch {
        // 이미 끝났다
      }
      finish(out || null);
    }, timeoutMs);
    p.stdout?.on('data', (d) => {
      out += d.toString('utf8');
    });
    p.on('error', () => {
      clearTimeout(timer);
      finish(null);
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      finish(code === 0 ? out : out || null);
    });
  });
}

/**
 * EXIF 회전까지 반영한 실제 크기. identify 는 회전 전 픽셀을 알려주므로,
 * 촬영 화면에서 잡은 사각형과 좌표계를 맞추려면 -auto-orient 를 거친 값이어야 한다.
 */
async function orientedSize(srcPath: string): Promise<{ w: number; h: number }> {
  const raw = await run(MAGICK, [`${srcPath}[0]`, '-auto-orient', '-format', '%w %h', 'info:'], 8000);
  const [w, h] = String(raw || '').trim().split(/\s+/).map(Number);
  return { w: w || 0, h: h || 0 };
}

// 줄일지 말지는 크기로 정할 수 없다 — **영수증이 프레임을 얼마나 채우는가** 로 갈린다.
// 실측(2026-08-14)에서 거의 같은 크기의 두 판이 정반대로 나왔다.
//   · 영수증만 딱 담긴 1750x2700 → 그대로가 최선. 2400 으로 줄이면(86%) 사업자등록번호
//     줄이 통째로 사라진다. 감열지의 가는 획은 재샘플링에 극도로 약하다.
//   · 배경이 남은 1800x2800 → 2400 + 흐림이 최선. 글자 360 → 525 로 늘고, 그대로는
//     못 읽던 주소까지 읽어냈다. 배경 잡음이 줄어드는 이득이 손실보다 크다.
// 서버는 어느 쪽인지 알 수 없으므로 둘 다 돌려 보고 점수로 고른다(readTextBestOf).
// 다만 자르지 않은 폰 원본은 한 판에 20초가 넘어 둘 다 돌릴 수 없고, 거기서는
// 2400 + 흐림이 확실히 낫다는 것이 이미 측정돼 있다(BIG_INPUT_PIXELS 주석).
function resizeTarget(shrink: boolean): string {
  return shrink ? `${PHOTO_EDGE}x${PHOTO_EDGE}>` : `${MAX_EDGE}x${MAX_EDGE}>`;
}

/** 0..1 로 받은 사각형을 실제 픽셀 좌표로. 화면 밖으로 나가지 않게 가둔다. */
function cropGeometry(box: CropBox, w: number, h: number) {
  const cw = Math.max(1, Math.round(box.w * w));
  const ch = Math.max(1, Math.round(box.h * h));
  const cx = Math.min(Math.max(0, Math.round(box.x * w)), Math.max(0, w - cw));
  const cy = Math.min(Math.max(0, Math.round(box.y * h)), Math.max(0, h - ch));
  return { cw: Math.min(cw, w - cx), ch: Math.min(ch, h - cy), cx, cy };
}

/**
 * 판독용으로 이미지를 다듬어 새 파일을 만든다. 실패하면 null — 원본을 그대로 쓰면 된다.
 * rotate 는 EXIF 를 적용한 **뒤에** 추가로 돌릴 각도다(책상에 눕혀 놓고 찍은 영수증용).
 *
 * 국소 적응 이진화(-lat)도 재봤지만 감열지에서는 오히려 나빴다(맞춘 항목 6 → 3).
 * 감열 인쇄의 부드러운 농담을 뭉개버린다. 회색조 + normalize 가 가장 좋았다.
 */
async function prepare(
  srcPath: string,
  rotate: number,
  crop: CropBox | undefined,
  shrink: boolean | 'auto' | 'flip'
): Promise<string | null> {
  if (!(await preprocessAvailable())) return null;
  const out = `${srcPath}.pp.png`;

  const size = await orientedSize(srcPath);
  const geo = crop && size.w && size.h ? cropGeometry(crop, size.w, size.h) : null;

  // 자르고 난 화소 수로 판단한다. 800만을 넘으면 배경까지 담긴 폰 원본이라는 뜻이고,
  // 그 아래면 이미 영수증만 남은 판이라는 뜻이다.
  const pixels = geo ? geo.cw * geo.ch : size.w * size.h;
  const auto = pixels > BIG_INPUT_PIXELS;
  const doShrink =
    shrink === 'auto' ? auto : shrink === 'flip' ? !auto : !!shrink;

  const args = [
    '-limit', 'memory', '256MB',
    '-limit', 'map', '512MB',
    srcPath,
    '-auto-orient',            // EXIF 회전을 실제 픽셀에 적용
    '-strip',                  // 플래그 제거 — 남겨두면 뒤에서 또 헷갈린다
  ];
  // 촬영 화면에서 잡은 사각형만 남긴다. 배경(책상·손·옷)이 넓게 들어갈수록 판독이
  // 나빠지고 느려진다는 것이 실측으로 확인됐다(전체 프레임 25초 · 영수증만 6초).
  if (geo) args.push('-crop', `${geo.cw}x${geo.ch}+${geo.cx}+${geo.cy}`, '+repage');
  if (rotate) args.push('-rotate', String(rotate));
  args.push(
    '-colorspace', 'Gray',
    '-resize', resizeTarget(doShrink),   // '>' = 더 큰 경우에만 줄인다
  );
  // 줄인 판에만 아주 약하게 흐림을 준다.
  //
  // 처음 이 값을 찾은 건 우연이었다. 실측용으로 미리 줄여 둔 JPEG 로 잰 판은
  // 사업자등록번호를 읽었는데, 같은 처리를 한 번에 이어서 한 판은 못 읽었다.
  // 둘의 유일한 차이가 중간에 낀 JPEG 재인코딩이었다 — 그 손실이 감열지의 얼룩을
  // 눌러 주고 있었다. 그래서 같은 효과를 눈에 보이는 한 줄로 바꿔 놓는다.
  //   실측(2026-08-14, 스타벅스 영수증 3000x4000):
  //     흐림 없음 → 사업자번호 못 읽음(글자 1510)
  //     -blur 0x0.5 → 201-81-21515 읽음(글자 1939)   ← 채택
  //     -blur 0x0.8 / -gaussian-blur 0x0.6 / -despeckle → 다시 못 읽음
  // 축소와 한 벌로 움직인다. 줄이면서 생긴 계단을 눌러 주는 역할이라, 줄이지 않는
  // 판에 혼자 얹으면 오히려 획을 뭉갠다(같은 날 crop 판에서 확인).
  if (doShrink) args.push('-blur', '0x0.5');
  args.push('-normalize', out);
  const r = await run(MAGICK, args, 20000);
  if (r === null) return null;
  try {
    const st = await fs.promises.stat(out);
    return st.size > 0 ? out : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ EXIF */

// 영수증 인증에서 EXIF 는 글자와 **무관한 두 번째 증거**다. 영수증에 뭐라고 찍혔든,
// "이 사람이 그 자리에서 직접 찍었는가" 는 사진 자체가 말해 준다.
//
// 네이버 영수증 리뷰가 「메신저로 전송받은 이미지(메타데이터 손실)」 를 인증 불가로
// 두는 이유가 이것이다. 카카오톡을 거치면 GPS 가 지워지므로, 남의 영수증 사진을
// 받아서 올리는 경로가 막힌다. OCR 정확도를 아무리 올려도 못 잡는 종류의 부정이다.
//   실측(2026-08-12): 카톡으로 받은 갤럭시 사진 — DateTimeOriginal·Model 은 남고
//   GPS 태그는 0개였다.

export type ExifInfo = {
  /** 촬영 시각(ms). 0 이면 없음 — 메신저를 거쳤거나 편집된 사진일 수 있다. */
  shotAt: number;
  hasGps: boolean;
  make: string;
  model: string;
  /** 카메라 정보가 통째로 없다 — 원본이 아닐 가능성이 높다는 신호. */
  stripped: boolean;
};

const IDENTIFY = process.env.PEED_IDENTIFY || 'identify';

/** `2026:08:12 17:52:19` → ms. 형식이 다르면 0. */
function exifTime(s: string): number {
  const m = String(s || '').match(/(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return 0;
  const t = new Date(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), Number(m[6])
  ).getTime();
  return isFinite(t) ? t : 0;
}

export async function readExif(image: ImageBytes): Promise<ExifInfo> {
  const empty: ExifInfo = { shotAt: 0, hasGps: false, make: '', model: '', stripped: true };
  if (!(await preprocessAvailable())) return empty;

  const tmp = path.join(
    os.tmpdir(),
    `peed_exif_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}.${image.ext}`
  );
  try {
    await fs.promises.writeFile(tmp, image.buf);
    const raw = await run(
      IDENTIFY,
      ['-format', '%[EXIF:DateTimeOriginal]\n%[EXIF:GPSLatitude]\n%[EXIF:Make]\n%[EXIF:Model]', tmp],
      8000
    );
    if (raw === null) return empty;
    const [dt = '', gps = '', make = '', model = ''] = raw.split('\n').map((s) => s.trim());
    const shotAt = exifTime(dt);
    return {
      shotAt,
      hasGps: !!gps,
      make,
      model,
      stripped: !shotAt && !make && !model,
    };
  } catch {
    return empty;
  } finally {
    fs.promises.unlink(tmp).catch(() => {});
  }
}

/* ---------------------------------------------------------------- 판독 */

export type ReadOpts = {
  /** EXIF 보정 뒤 추가로 돌릴 각도(0/90/180/270). 눕혀 찍은 영수증을 세울 때 쓴다. */
  rotate?: number;
  /** psm 6 = 균일한 텍스트 블록. 영수증·캡처 모두 실측에서 이게 가장 좋았다. */
  psm?: number;
  /** 영수증만 남기고 잘라낼 영역. 촬영 화면의 가이드 프레임이 정한다. */
  crop?: CropBox;
  /**
   * 긴 변 2400 으로 줄이고 약하게 흐릴지. 배경이 남은 사진에는 크게 이롭고,
   * 영수증만 딱 담긴 판에는 해롭다(자세한 실측은 resizeTarget 위 주석).
   *   'auto' — 자르고 난 크기가 800만 화소를 넘으면 줄인다(폰 원본이라는 뜻)
   *   'flip' — auto 가 고른 것의 반대. 첫 판이 시원찮을 때 다른 쪽을 대 보는 용도
   */
  shrink?: boolean | 'auto' | 'flip';
};

/**
 * 이미지에서 글자를 뽑는다. 실패하면 빈 문자열(호출한 쪽이 수동 입력으로 흘린다).
 *
 * dpi 를 명시하는 이유: 안 주면 tesseract 가 "Invalid resolution 0 dpi. Using 70 instead."
 * 로 떨어져 글자 크기 판단이 통째로 어긋난다.
 */
export async function readText(image: ImageBytes, opts: ReadOpts = {}): Promise<string> {
  if (!(await ocrAvailable())) return '';
  await acquire();
  const tmp = path.join(
    os.tmpdir(),
    `peed_ocr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}.${image.ext}`
  );
  let pp: string | null = null;
  try {
    await fs.promises.writeFile(tmp, image.buf);
    pp = await prepare(tmp, opts.rotate || 0, opts.crop, opts.shrink ?? 'auto');
    const target = pp || tmp;
    const out = await run(
      BIN,
      [target, 'stdout', '-l', 'kor+eng', '--psm', String(opts.psm ?? 6), '--dpi', '300'],
      TIMEOUT_MS
    );
    return out || '';
  } catch {
    return '';
  } finally {
    release();
    fs.promises.unlink(tmp).catch(() => {});
    if (pp) fs.promises.unlink(pp).catch(() => {});
  }
}

/** 한 번의 판독 시도 — 어떤 각도로, 줄여서 볼지 말지. */
export type ReadPass = { rotate: number; shrink: boolean };

/**
 * 여러 조건으로 읽어 보고, 호출한 쪽이 매긴 점수가 가장 높은 결과를 준다.
 *
 * 영수증에는 사업자등록번호 체크섬이라는 정답지가 있어서, 어느 판이 제대로 읽혔는지를
 * 추측이 아니라 계산으로 안다. tesseract 자체 방향 감지(--psm 0)는 배경이 넓은 사진에서
 * 신뢰도 0.08 에 "Arabic" 이라고 답할 만큼 못 미더워서 쓰지 않는다.
 *
 * 시도 순서는 호출한 쪽이 정한다 — 흔한 경우가 앞에 와야 첫 판에서 끝난다.
 */
export async function readTextBestOf(
  image: ImageBytes,
  score: (text: string) => number,
  opts: { passes?: ReadPass[]; enough?: number; budgetMs?: number; crop?: CropBox } = {}
): Promise<{ text: string; rotate: number; score: number }> {
  const passes = opts.passes ?? [
    { rotate: 0, shrink: true },
    { rotate: 90, shrink: true },
    { rotate: 270, shrink: true },
  ];
  const enough = opts.enough ?? 0.5;
  // 다 돌리면 최악 45초×N 이라 유저가 기다리다 나간다. 한 판이라도 끝났으면 예산을
  // 넘긴 시점에서 멈춘다 — 남은 시도에서 더 나은 결과가 나올 가능성보다 응답이
  // 오지 않는 손해가 크다.
  const budgetMs = opts.budgetMs ?? 70000;
  const started = Date.now();

  // 글자 수가 아니라 **점수**로 고른다. 예전에는 "쓸 만한가" 를 참/거짓으로 물었는데,
  // 그러면 문턱을 못 넘은 판들이 전부 동점이 되어 결국 글자가 많은 쪽(= 배경 잡음이
  // 많은 쪽)이 뽑혔다. 실측에서 90도 판이 매장 전화번호를 건졌는데도, 문턱을 못 넘었다는
  // 이유로 아무것도 못 건진 0도 판에 밀렸다.
  let best = { text: '', rotate: passes[0]?.rotate ?? 0, score: -1 };
  for (const pass of passes) {
    const text = await readText(image, { ...pass, crop: opts.crop });
    const s = score(text);
    if (s > best.score) best = { text, rotate: pass.rotate, score: s };
    if (s >= enough) break;   // 충분히 좋으면 남은 시도는 하지 않는다
    if (Date.now() - started > budgetMs) break;
  }
  return best;
}

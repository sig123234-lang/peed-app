import {
  bytesHash,
  decodeDataUrl,
  ocrAvailable,
  readExif,
  readTextBestOf,
  type CropBox,
  type ExifInfo,
  type ReadPass,
} from './_ocr';
import {
  RECEIPT_MAX_AGE_DAYS,
  checkReceipt,
  parseReceipt,
  type ShotMeta,
} from './_receipt';
import { readUid, readUserCookie } from './_session';
import { saveDataUrl } from './_store';
import {
  blockReason,
  findDuplicateShot,
  saveScan,
  textFingerprint,
  type ScanRecord,
} from './_verify';

// 리뷰 인증 API — 유저는 방문한 매장의 영수증 사진 한 장만 올리면 된다.
//
//   POST /api/verify?action=scan  { shot, exif? }  → 영수증 판독 → 결제 사실·주의 문구
//
// 예전에는 다른 플랫폼의 '리뷰 쓰기 완료' 화면을 캡처하게 했다. 그건 "다른 데
// 리뷰를 썼다" 는 증거지 "이 매장에 갔다" 는 증거가 아니었고, 리뷰를 PEED 밖에서
// 쓰게 만든다는 더 큰 문제가 있었다. 이제 리뷰는 PEED 안에서 쓰고, 방문 증거만
// 영수증이 맡는다. 일회용 인증 코드(GET ?action=code)도 같은 이유로 없앴다.
//
// **여기서 매장을 판정하지 않는다.** 영수증에 찍히는 상호는 사업자등록증상의 이름이라
// 간판과 다른 경우가 흔하고, 감열지 판독은 절반쯤 무너지는 게 정상이다. 매장은 회원이
// /api/public?action=searchPlace 로 골라 확정하고, 이 API 는 넷만 답한다 —
// **영수증이 맞나 / 언제 얼마를 썼나 / 중복이 아닌가 / 직접 찍은 사진인가.**
// 영수증에서 읽은 주소·전화는 나중에 고른 매장과 맞춰 보는 용도로만 넘긴다.
//
// 판독 결과는 scanId 로 서버에 잠깐 보관한다. /api/review 가 그 id 로 결과를
// 이어받으므로 같은 사진을 두 번 올리지 않고, OCR 도 한 번만 돈다.
//
// 기본은 '지급하되 플래그' 라 대부분의 신호는 warnings 로만 알려 주고 막지 않는다.
// 예외는 둘뿐이다 — 같은 영수증 재제출과 기한이 지난 영수증(_verify.blockReason).
// 그 둘은 blocked 로 내려 화면이 리뷰를 쓰기 **전에** 막게 한다. 다 쓰고 나서 제출
// 단계에서 막으면 쓴 글이 통째로 헛수고가 되기 때문이다. 판정 자체는 /api/review 가
// 다시 하므로, 화면이 이 값을 무시하더라도 지급되지는 않는다.

/**
 * 촬영 정보. 서버가 업로드된 바이트에서 직접 읽는 것이 원칙이다.
 *
 * 다만 갤러리 앱·브라우저가 사진을 다시 인코딩하면서 EXIF 를 통째로 지워 보내는
 * 경우가 있어, 서버가 아무것도 못 읽었을 때만 클라이언트가 원본에서 읽어 보낸 값을
 * 받아 쓴다. 위조할 수 있는 값이지만 이걸로 얻는 건 낮은 가중치 플래그 하나가
 * 빠지는 것뿐이고(정책: 지급하되 플래그), 그 이득보다 멀쩡히 직접 찍은 사진이
 * 억울하게 걸리는 손해가 크다.
 */
function mergeExif(server: ExifInfo, client: any, now: number): ShotMeta {
  const own: ShotMeta = {
    shotAt: server.shotAt,
    hasGps: server.hasGps,
    stripped: server.stripped,
  };
  if (!server.stripped) return own;

  const shotAt = Number(client?.shotAt) || 0;
  const hasGps = !!client?.hasGps;
  // 미래이거나 10년보다 오래된 값은 믿지 않는다 — 클라이언트가 준 값이라 더 그렇다.
  const sane = shotAt > 0 && shotAt < now + 24 * 3600 * 1000 && shotAt > now - 3650 * 24 * 3600 * 1000;
  if (!sane && !hasGps) return own;
  return { shotAt: sane ? shotAt : 0, hasGps, stripped: false };
}

/**
 * 촬영 화면의 가이드 프레임이 보내오는 사각형(0..1). 이상한 값은 그냥 버린다 —
 * 자르기는 판독을 돕자고 하는 일이라, 값이 미심쩍으면 통째로 읽는 편이 낫다.
 * 너무 작은 영역(한 변 20% 미만)도 받지 않는다. 잘못 잡으면 글자가 통째로 날아간다.
 */
function readCrop(raw: any): CropBox | undefined {
  const x = Number(raw?.x);
  const y = Number(raw?.y);
  const w = Number(raw?.w);
  const h = Number(raw?.h);
  if (![x, y, w, h].every((v) => Number.isFinite(v))) return undefined;
  if (w < 0.2 || h < 0.2 || w > 1 || h > 1) return undefined;
  if (x < 0 || y < 0 || x + w > 1.001 || y + h > 1.001) return undefined;
  // 전체를 다 고른 것과 같으면 자를 이유가 없다.
  if (w > 0.99 && h > 0.99) return undefined;
  return { x, y, w, h };
}

async function handleScan(uid: string, body: any, res: any) {
  if (!uid) {
    res.status(200).json({ ok: false, error: 'login_required' });
    return;
  }
  if (!(await ocrAvailable())) {
    // 판독기가 없으면 자동 입력만 못 할 뿐, 직접 입력해서 계속 진행할 수 있다.
    res.status(200).json({ ok: false, error: 'ocr_unavailable' });
    return;
  }

  const image = decodeDataUrl(String(body?.shot || ''));
  if (!image) {
    res.status(200).json({ ok: false, error: 'bad_image' });
    return;
  }

  const now = Date.now();

  // 글자 판독과 촬영 정보 읽기는 서로 독립이라 같이 돌린다.
  //
  // 각도를 돌려가며 읽는 이유는 _ocr.readTextBestOf 에 적어 뒀다. 점수는 판독 결과의
  // 신뢰도(사업자번호 체크섬·전화·일시…)를 그대로 쓴다 — 영수증에는 정답지가 있어서
  // "방향이 맞았나" 를 추측이 아니라 계산으로 고를 수 있다.
  // 줄여서 읽을지 말지는 '영수증이 프레임을 얼마나 채우는가' 로 갈리는데 서버는 그걸
  // 모른다. 그래서 화소 수로 짐작하고(auto), 시원찮으면 반대쪽(flip)도 대 본 뒤
  // 점수로 고른다. 자세한 실측은 _ocr.resizeTarget 위 주석에 적어 뒀다.
  const crop = readCrop(body?.crop);
  const passes: ReadPass[] = [
    // 크기로 짐작한 쪽을 먼저. 대부분 여기서 끝난다.
    { rotate: 0, shrink: 'auto' },
    // 짐작이 틀렸을 수 있으니 반대쪽도 대 본다.
    { rotate: 0, shrink: 'flip' },
    // 눕혀 찍은 영수증 구제 — 드문 경우라 맨 뒤에 둔다.
    { rotate: 90, shrink: 'auto' },
    { rotate: 270, shrink: 'auto' },
  ];

  // 어느 판을 고를지는 판독 신뢰도로 재되, **주소에 가산점을 준다.**
  // 신뢰도는 사업자등록번호에 0.40 을 주고 주소에는 0.06 만 주는데, 그 배점은 영수증으로
  // 매장을 알아내던 시절의 것이다. 지금 매장은 회원이 골라 확정하고 영수증 주소는
  // '그 매장이 맞는지' 를 가리는 유일한 근거라, 고를 때만큼은 훨씬 무겁게 쳐야 한다.
  const pick = (t: string) => {
    const p = parseReceipt(t, now);
    return p.confidence + (p.address ? 0.15 : 0);
  };

  // 문턱은 한 판이 얼마나 비싼지에 맞춘다. 잘라 온 판은 4~5초라 주소를 건질 때까지
  // 더 뒤져도 되고, 통째로 온 판은 20초가 넘어 '영수증인 건 알겠다' 싶으면 멈춰야 한다.
  // (문턱을 높게 뒀다가 이미 충분히 읽힌 판을 들고 80초를 쓴 적이 있다.)
  const [best, exif] = await Promise.all([
    readTextBestOf(image, pick, {
      enough: crop ? 0.45 : 0.25,
      budgetMs: 40000,
      crop,
      passes,
    }),
    readExif(image),
  ]);

  const meta = mergeExif(exif, body?.exif, now);
  const verdict = checkReceipt(best.text, meta, now);

  // 판독에 실패해도 여기서 되돌려보내지 않는다. 사진 자체(바이트 지문·촬영 정보)가
  // 여전히 증거이고, 못 읽은 것은 위험 신호(ocr_unreadable / not_receipt)로 남는다.
  const byteHash = bytesHash(image.buf);
  const textHash = textFingerprint(best.text);
  const dup = await findDuplicateShot({ byteHash, textHash, receiptKey: verdict.key });

  // 증거용으로 사진을 남긴다. 위험 신호가 없으면 /api/review 가 바로 지운다.
  const saved = await saveDataUrl(String(body?.shot || ''));

  const rec: ScanRecord = {
    id: `sc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    uid,
    ts: now,
    byteHash,
    textHash,
    receiptKey: verdict.key,
    ocrText: best.text.slice(0, 4000),
    shotUrl: saved?.url || '',
    shotKey: saved?.key || '',
    dupOf: dup ? dup.hit.uid : '',
    dupKind: dup ? dup.kind : '',
    receipt: verdict,
    exif: meta,
  };

  await saveScan(rec);

  // 이 영수증으로는 인증할 수 없는 경우 — 이유를 여기서 미리 알려 준다.
  // 리뷰를 다 쓰고 나서 제출 단계에서 막으면 쓴 글이 통째로 헛수고가 된다.
  // (판정 자체는 /api/review 가 다시 한다 — 화면의 안내를 믿고 지급할 수는 없다.)
  const dupCodes: string[] = [];
  if (dup) dupCodes.push(dup.kind === 'receipt' ? 'dup_receipt' : dup.kind === 'image' ? 'dup_image' : 'dup_text');
  const blocked = blockReason([...verdict.flags, ...dupCodes], verdict.at > 0);

  // 그 밖의 주의 문구 — 적립을 막지는 않는다(정책: 지급하되 플래그).
  const warnings: string[] = [];
  if (!verdict.isReceipt) {
    // 실측에서 판독을 살리고 죽인 것은 화질이 아니라 '영수증이 화면에서 차지하는 비율'
    // 이었다. 배경(책상·손)이 넓게 들어갈수록 나빠진다. 그래서 조명이 아니라 구도를 말한다.
    warnings.push('영수증이 화면에 꽉 차게, 반듯하게 다시 찍어 주세요.');
  }
  // 막힌 사유는 warnings 에 또 넣지 않는다 — 화면에서 따로, 더 크게 보여 준다.
  if (dup && !blocked) warnings.push('예전에 제출된 적 있는 사진이에요.');
  if (verdict.flags.includes('receipt_stale') && !blocked) {
    warnings.push(`${RECEIPT_MAX_AGE_DAYS}일이 지난 영수증으로 보여요. 최근 방문 영수증이 더 확실해요.`);
  }
  if (verdict.flags.includes('receipt_future')) {
    warnings.push('결제 시각이 미래로 읽혔어요. 다른 사진은 아닌지 확인해 주세요.');
  }
  if (verdict.flags.includes('shot_before_payment')) {
    warnings.push('결제 시각보다 먼저 찍힌 사진이에요.');
  }
  if (verdict.flags.includes('shot_meta_stripped')) {
    warnings.push('메신저로 받은 사진은 촬영 정보가 지워져요. 직접 찍은 사진이면 더 확실하게 인증돼요.');
  }

  res.status(200).json({
    ok: true,
    // 막힌 경우에도 scanId 는 준다. 화면이 '무엇 때문에 막혔는지' 를 이 판독 결과와
    // 함께 보여 줘야 하고, 어차피 제출은 서버가 다시 막는다.
    scanId: rec.id,
    blocked,
    // "이 영수증이 맞나" 를 화면에서 눈으로 확인시켜 주는 값들.
    // 매장명·별점·본문은 여기서 채우지 않는다 — 매장은 회원이 골라 확정하고,
    // 별점과 리뷰는 PEED 안에서 직접 쓴다. 그게 이 방식의 요지다.
    receipt: {
      isReceipt: verdict.isReceipt,
      confidence: verdict.confidence,
      at: verdict.at,
      total: verdict.total,
      address: verdict.hints.address,
    },
    warnings,
  });
}

export default async function handler(req: any, res: any) {
  const uid = readUid(readUserCookie(req.headers?.cookie)) || '';
  const action = String(req.query?.action || '');

  try {
    if (req.method === 'POST' && action === 'scan') {
      let b = req.body;
      if (typeof b === 'string') {
        try {
          b = JSON.parse(b);
        } catch {
          b = {};
        }
      }
      return await handleScan(uid, b, res);
    }

    res.status(400).json({ ok: false, error: 'bad_action' });
  } catch (e: any) {
    res.status(200).json({ ok: false, error: 'verify_failed', detail: String(e?.message || e) });
  }
}

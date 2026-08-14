import { loadBurningStores, matchBurningStore } from './_match';
import {
  bytesHash,
  decodeDataUrl,
  ocrAvailable,
  readExif,
  readTextBestOf,
  type ExifInfo,
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
  findDuplicateShot,
  saveScan,
  textFingerprint,
  type ScanRecord,
} from './_verify';

// 리뷰 인증 API — 유저는 방문한 매장의 영수증 사진 한 장만 올리면 된다.
//
//   POST /api/verify?action=scan  { shot, exif? }  → 영수증 판독 → 매장 힌트·주의 문구
//
// 예전에는 다른 플랫폼의 '리뷰 쓰기 완료' 화면을 캡처하게 했다. 그건 "다른 데
// 리뷰를 썼다" 는 증거지 "이 매장에 갔다" 는 증거가 아니었고, 리뷰를 PEED 밖에서
// 쓰게 만든다는 더 큰 문제가 있었다. 이제 리뷰는 PEED 안에서 쓰고, 방문 증거만
// 영수증이 맡는다. 일회용 인증 코드(GET ?action=code)도 같은 이유로 없앴다.
//
// 판독 결과는 scanId 로 서버에 잠깐 보관한다. /api/review 가 그 id 로 결과를
// 이어받으므로 같은 사진을 두 번 올리지 않고, OCR 도 한 번만 돈다.
//
// 무엇도 차단하지 않는다 — 정책은 '지급하되 플래그' 다. 여기서 나오는 warnings 는
// 유저가 스스로 고칠 기회일 뿐이고, 판정은 /api/review 가 위험 점수로 남긴다.

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
  const [best, exif] = await Promise.all([
    readTextBestOf(image, (t) => parseReceipt(t, now).confidence, { enough: 0.5 }),
    readExif(image),
  ]);

  const meta = mergeExif(exif, body?.exif, now);
  const verdict = checkReceipt(best.text, meta, now);

  // 판독에 실패해도 여기서 되돌려보내지 않는다. 사진 자체(바이트 지문·촬영 정보)가
  // 여전히 증거이고, 못 읽은 것은 위험 신호(ocr_unreadable / not_receipt)로 남는다.
  const byteHash = bytesHash(image.buf);
  const textHash = textFingerprint(best.text);
  const [dup, stores] = await Promise.all([
    findDuplicateShot({ byteHash, textHash, receiptKey: verdict.key }),
    loadBurningStores(),
  ]);

  // 영수증에서 읽은 상호로 버닝 매장을 찾아 둔다 — 유저가 버닝인 줄 몰라도 잡힌다.
  // 다만 여기서 정한 값은 화면에 미리 보여주기 위한 것이고, 최종 판정은 회원이 적어
  // 넣은 매장명으로 /api/review 가 다시 한다(감열지 상호는 자주 흔들린다).
  const match = verdict.hints.store ? matchBurningStore(verdict.hints.store, stores) : null;

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
    resolvedStore: match ? match.store.name : verdict.hints.store,
    burning: !!match,
    reward: match ? match.store.reward : 2,
  };

  await saveScan(rec);

  // 유저에게 보여줄 주의 문구 — 적립을 막지는 않는다(정책: 지급하되 플래그).
  const warnings: string[] = [];
  if (!verdict.isReceipt) {
    warnings.push('영수증이 아닌 것 같아요. 글자가 잘 보이게 다시 찍어 주세요.');
  }
  if (dup) {
    warnings.push(
      dup.kind === 'receipt'
        ? '이미 인증에 사용된 영수증이에요.'
        : '예전에 제출된 적 있는 사진이에요.'
    );
  }
  if (verdict.flags.includes('receipt_stale')) {
    warnings.push(`${RECEIPT_MAX_AGE_DAYS}일이 지난 영수증이에요. 최근 방문 영수증으로 인증해 주세요.`);
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
    scanId: rec.id,
    // 회원이 확인만 하면 되도록 채워 주는 값. 별점·본문은 채우지 않는다 —
    // 영수증에는 없는 값이고, 리뷰는 PEED 안에서 직접 쓰는 것이 이 방식의 요지다.
    fields: {
      store: rec.resolvedStore,
      category: match ? match.store.category : '',
      // 등록 매장이면 그 지역, 아니면 영수증 주소(구까지 찍혀 있다).
      region: match ? match.store.region : verdict.hints.address,
    },
    burning: rec.burning,
    reward: rec.reward,
    // 영수증에서 읽은 원래 상호 — 버닝으로 승격됐을 때 화면에서 알려 주려고 같이 준다.
    scannedStore: verdict.hints.store,
    // "이 영수증이 맞나" 를 화면에서 확인시켜 주는 값들.
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

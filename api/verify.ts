import { loadBurningStores, matchBurningStore, similarity } from './_match';
import { bytesHash, decodeDataUrl, ocrAvailable, readText } from './_ocr';
import { readUid, readUserCookie } from './_session';
import { saveDataUrl } from './_store';
import {
  checkCode,
  findDuplicateShot,
  issueCode,
  parseReviewShot,
  saveScan,
  textFingerprint,
  type ScanRecord,
} from './_verify';

// 리뷰 인증 API — 유저는 네이버 '리뷰 쓰기 완료' 화면 캡처 한 장만 올리면 된다.
//
//   GET  /api/verify?action=code   → 이번에 붙일 일회용 인증 코드 발급
//   POST /api/verify?action=scan   → 캡처 판독 → 매장명·별점·본문 자동 추출
//
// 판독 결과는 scanId 로 서버에 잠깐 보관한다. /api/review 가 그 id 로 결과를
// 이어받으므로 같은 사진을 두 번 올리지 않고, OCR 도 한 번만 돈다.

async function handleCode(uid: string, res: any) {
  if (!uid) {
    res.status(200).json({ ok: false, error: 'login_required' });
    return;
  }
  const rec = await issueCode(uid);
  res.status(200).json({
    ok: true,
    code: `PEED-${rec.code}`,
    plain: rec.code,
    expiresAt: rec.expiresAt,
  });
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

  const ocrText = await readText(image);
  if (!ocrText.trim()) {
    res.status(200).json({ ok: false, error: 'unreadable' });
    return;
  }

  const parsed = parseReviewShot(ocrText);
  const byteHash = bytesHash(image.buf);
  const textHash = textFingerprint(ocrText);
  const [code, dup, stores] = await Promise.all([
    checkCode(uid, ocrText),
    findDuplicateShot(byteHash, textHash),
    loadBurningStores(),
  ]);

  // 캡처에서 읽은 이름으로 버닝 매장을 찾는다 — 유저가 버닝인 줄 몰라도 잡힌다.
  const match = parsed.store ? matchBurningStore(parsed.store, stores) : null;

  // 증거용으로 캡처를 남긴다. 위험 신호가 없으면 /api/review 가 바로 지운다.
  const saved = await saveDataUrl(String(body?.shot || ''));

  const rec: ScanRecord = {
    id: `sc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    uid,
    ts: Date.now(),
    byteHash,
    textHash,
    ocrText: ocrText.slice(0, 4000),
    shotUrl: saved?.url || '',
    shotKey: saved?.key || '',
    codeState: code.state,
    codeValue: code.code,
    dupOf: dup ? dup.uid : '',
    parsed,
    resolvedStore: match ? match.store.name : parsed.store,
    burning: !!match,
    reward: match ? match.store.reward : 2,
  };

  await saveScan(rec);

  // 유저에게 보여줄 주의 문구 — 적립을 막지는 않는다(정책: 지급하되 플래그).
  const warnings: string[] = [];
  if (!parsed.isReviewScreen) {
    warnings.push('리뷰 작성 완료 화면이 아닌 것 같아요. 맞는 화면인지 확인해 주세요.');
  }
  if (code.state === 'missing') {
    warnings.push('캡처에서 인증 코드를 찾지 못했어요. 리뷰 맨 앞에 코드를 붙였는지 확인해 주세요.');
  } else if (code.state === 'reused') {
    warnings.push('이미 사용한 인증 코드예요. 새 코드로 다시 인증해 주세요.');
  } else if (code.state === 'foreign') {
    warnings.push('본인에게 발급된 코드가 아니에요.');
  }
  if (dup) warnings.push('예전에 제출된 적 있는 캡처예요.');

  res.status(200).json({
    ok: true,
    scanId: rec.id,
    fields: {
      store: rec.resolvedStore,
      category: match ? match.store.category : parsed.category,
      region: match ? match.store.region : parsed.region,
      rating: parsed.rating,
      body: parsed.body,
      platform: parsed.platform,
    },
    burning: rec.burning,
    reward: rec.reward,
    // 캡처에서 읽은 원래 이름 — 버닝으로 승격됐을 때 화면에서 알려 주려고 같이 준다.
    scannedStore: parsed.store,
    codeState: code.state,
    isReviewScreen: parsed.isReviewScreen,
    warnings,
  });
}

export default async function handler(req: any, res: any) {
  const uid = readUid(readUserCookie(req.headers?.cookie)) || '';
  const action = String(req.query?.action || '');

  try {
    if (req.method === 'GET' && action === 'code') return await handleCode(uid, res);

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

/** 입력한 매장명과 캡처에서 읽은 이름이 사실상 같은지 — 위험도 채점에 쓴다. */
export function storeNamesAgree(typed: string, scanned: string): boolean {
  if (!typed || !scanned) return true;
  return similarity(typed, scanned) >= 0.8;
}

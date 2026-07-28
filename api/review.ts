import { resolveStore, similarity } from './_match';
import * as passport from './_passport';
import { readUid, readUserCookie } from './_session';
import { deleteKey, getJSON, putJSON, storeConfigured } from './_store';
import {
  behaviourFlags,
  burnCode,
  dropScan,
  rememberShot,
  scoreRisk,
  takeScan,
} from './_verify';
import * as wallet from './_wallet';
import { matchRegion, regionKey } from '../data/regions';

// Public: 앱에서 작성한 리뷰를 서버에 저장 → 어드민의 당첨자 후기 자동 매칭 + 리뷰 PB 적립.
//   POST /api/review { author, handle?, store?, rating?, caption?, district?, location?, scanId? }
//
// 버닝 여부는 서버가 정한다. 예전에는 클라이언트가 보낸 burning 값을 그대로 믿어서,
// 유저가 버닝 매장인 줄 모르고 '일반 리뷰'로 올리면 10PB 대신 2PB만 들어갔다.
// 이제는 매장명을 등록된 버닝 매장과 대조해 같은 곳이면 자동으로 승격시킨다.
//
// 부정 인증은 막지 않고 점수만 매긴다(정책: 지급은 하되 플래그). 위험 신호가 있는
// 건만 캡처를 증거로 남기고 어드민 모더레이션 목록에 올린다.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }
  if (!storeConfigured()) {
    res.status(200).json({ ok: false, error: 'store_not_connected' });
    return;
  }
  let b = req.body;
  if (typeof b === 'string') {
    try {
      b = JSON.parse(b);
    } catch {
      b = {};
    }
  }
  const author = String(b?.author || '').trim();
  const handle = String(b?.handle || '').trim();
  if (!author && !handle) {
    res.status(400).json({ ok: false, error: 'no_author' });
    return;
  }
  try {
    const uid = readUid(readUserCookie(req.headers?.cookie)) || '';
    const reviews = await getJSON<any[]>('v2/reviews.json', []);
    const typedStore = String(b?.store || '').trim();
    const caption = String(b?.caption || '').slice(0, 500);

    // ── 캡처 판독 결과 이어받기 ──
    const scan = await takeScan(String(b?.scanId || ''), uid);

    // ── 버닝 판정(서버 권위) ──
    // 캡처에서 읽은 이름이 있으면 그쪽이 네이버플레이스 표기라 더 정확하다.
    const nameForMatch = scan?.parsed?.store || typedStore;
    const resolved = await resolveStore(nameForMatch || typedStore);
    const storeName = resolved.storeName || typedStore;

    // ── 위험 신호 모으기 ──
    const flagCodes: string[] = [];
    if (!scan) {
      flagCodes.push('shot_missing');
    } else {
      if (!scan.ocrText.trim()) flagCodes.push('ocr_unreadable');
      if (!scan.parsed.isReviewScreen) flagCodes.push('not_review_screen');
      if (scan.codeState === 'missing') flagCodes.push('keyword_missing');
      if (scan.codeState === 'plain') flagCodes.push('code_plain');
      if (scan.codeState === 'reused') flagCodes.push('code_reused');
      if (scan.codeState === 'foreign') flagCodes.push('code_foreign');
      if (scan.dupOf) flagCodes.push(scan.dupOf === uid ? 'dup_text' : 'dup_image');
      if (
        typedStore &&
        scan.parsed.store &&
        similarity(typedStore, scan.parsed.store) < 0.8
      ) {
        flagCodes.push('store_mismatch');
      }
    }
    if (uid) {
      const mine = reviews.filter((r) => r.uid === uid).slice(0, 60);
      flagCodes.push(...behaviourFlags(mine, Date.now(), storeName, caption));
    }
    let risk = scoreRisk(flagCodes);

    const rec: any = {
      id: `rv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      uid: uid || '',
      author,
      handle,
      store: storeName,
      storeId: resolved.storeId,
      rating: Number(b?.rating) || 0,
      caption,
      burning: resolved.burning,
      verified: !!scan && scan.codeState === 'ok',
      platform: String(b?.platform || scan?.parsed?.platform || '').trim().slice(0, 40),
      createdAt: Date.now(),
      date: new Date().toISOString().slice(0, 10),
      risk: risk.score,
      riskLevel: risk.level,
      flags: risk.flags.map((f) => f.code),
      // 증거는 위험 신호가 있을 때만 남긴다(디스크 절약 + 개인정보 최소 보관).
      shotUrl: risk.level === 'clean' ? '' : scan?.shotUrl || '',
    };

    // 리뷰 PB 적립 — 로그인 유저 한정. 횟수 제한은 두지 않는다(정책: 지급하되 플래그).
    let award = 0;
    let balance = 0;
    let bonusPb = 0;
    let region = '';
    let stampAdded = false;
    let stampCount = 0;
    let passportDone = false;
    if (uid) {
      // 예전에는 '같은 매장 하루 1회' 를 넘으면 적립을 걸렀다. 지금은 정책상
      // 적립을 막지 않고 same_store_day / same_store_spam 플래그로만 남긴다
      // (3회째부터는 그 플래그 하나로 어드민 검수 대상이 된다).
      // 도장은 여전히 매장당 한 번만 찍히므로(_passport.stamp) 보너스 PB 는
      // 반복 적립으로 늘어나지 않는다.
      if (rec.store) {
        award = resolved.reward;
        balance = await wallet.credit(
          uid,
          award,
          resolved.burning ? '버닝 리뷰 적립' : '리뷰 적립'
        );
        rec.awarded = true;

        // 지역 판별 — 등록 매장이면 그 주소가 가장 정확하다. 아니면 캡처에서 읽은
        // 지역, 클라가 준 지역/위치, 마지막으로 매장명·본문에서 찾는다.
        let source = `${resolved.region || ''} ${resolved.address || ''}`.trim();
        // 캡처에서 읽은 "서울 강남구 역삼동"은 구까지 들어 있어 등록 주소만큼 정확하다.
        if (!source) source = scan?.parsed?.region || '';
        if (!source.trim()) source = `${b?.district || ''} ${b?.location || ''}`;
        if (!source.trim()) source = `${rec.store} ${rec.caption}`;

        const matched = matchRegion(source);
        region = matched ? regionKey(matched) : '';
        rec.region = region;

        // 지역을 못 찾으면 이 리뷰는 도장이 영영 안 찍힌다. 그런데 지금까지는
        // 조용히 넘어가서 유저도 어드민도 이유를 알 수 없었다. 적립은 그대로 두되
        // 플래그로 남겨 검수 흐름에 노출한다(정책: 지급하되 플래그).
        if (!region) {
          flagCodes.push('region_unknown');
          risk = scoreRisk(flagCodes);
          rec.risk = risk.score;
          rec.riskLevel = risk.level;
          rec.flags = risk.flags.map((f) => f.code);
          rec.shotUrl = risk.level === 'clean' ? '' : scan?.shotUrl || '';
        }

        // 도장 패스포트 — 고른 지역의 '서로 다른 매장' 에만 찍힌다.
        if (region) {
          const r = await passport.stamp(uid, region, rec.store);
          stampAdded = r.added;
          stampCount = r.count;
          passportDone = r.done;
          if (r.done) {
            bonusPb = passport.PASSPORT_REWARD;
            balance = await wallet.credit(
              uid,
              bonusPb,
              `${r.region} 도장 ${passport.PASSPORT_GOAL}개 완주 보너스`
            );
          }
        }
      } else {
        balance = await wallet.getBalance(uid);
      }
    }

    reviews.unshift(rec);
    await putJSON('v2/reviews.json', reviews.slice(0, 3000));

    // 위험 신호가 있으면 어드민 '모더레이션' 목록에 자동으로 올린다.
    // 새 화면을 만들지 않고 기존 검수 흐름(PB 회수 포함)을 그대로 쓴다.
    if (risk.level !== 'clean') {
      const reports = await getJSON<any[]>('v2/reports.json', []);
      const dupish = risk.flags.some((f) =>
        [
          'dup_image',
          'dup_text',
          'code_reused',
          'same_store_day',
          'same_store_spam',
          'caption_echo',
        ].includes(f.code)
      );
      reports.unshift({
        id: `rp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
        reviewId: rec.id,
        target: `리뷰 · ${author || handle} · ${rec.store}`.slice(0, 60),
        targetAuthorId: uid,
        reason: dupish ? '중복 리뷰' : '허위 리뷰',
        reporter: 'PEED 자동검열',
        reporterId: '',
        detail: `위험 ${risk.score}점(${risk.level}) — ${risk.flags
          .map((f) => f.label)
          .join(', ')}`.slice(0, 300),
        shotUrl: rec.shotUrl,
        pbClaw: 0,
        status: 'pending',
        createdAt: Date.now(),
      });
      await putJSON('v2/reports.json', reports.slice(0, 5000));
    }

    // 판독 뒷정리 — 코드를 소각하고 지문을 남긴다. 이걸로 같은 캡처 재제출이 잡힌다.
    if (scan) {
      if (scan.codeState === 'ok') await burnCode(scan.codeValue, rec.id);
      await rememberShot({
        byteHash: scan.byteHash,
        textHash: scan.textHash,
        uid: uid || '',
        store: rec.store,
        ts: Date.now(),
      });
      if (risk.level === 'clean' && scan.shotKey) await deleteKey(scan.shotKey);
      await dropScan(scan.id);
    }

    res.status(200).json({
      ok: true,
      id: rec.id,
      award,
      bonusPb,
      region,
      stampAdded,
      stampCount,
      passportDone,
      goal: passport.PASSPORT_GOAL,
      balance,
      burning: resolved.burning,
      store: rec.store,
      risk: risk.level,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: 'review_failed', detail: String(e?.message || e) });
  }
}

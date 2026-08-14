import { resolveStore } from './_match';
import * as passport from './_passport';
import { checkPlaceAgainstReceipt, lookupPlace } from './_places';
import { readUid, readUserCookie } from './_session';
import { deleteKey, getJSON, putJSON, storeConfigured } from './_store';
import {
  behaviourFlags,
  dropScan,
  rememberShot,
  scoreRisk,
  takeScan,
} from './_verify';
import * as wallet from './_wallet';
import { matchRegion, regionKey } from '../data/regions';

// Public: 앱에서 작성한 리뷰를 서버에 저장 → 어드민의 당첨자 후기 자동 매칭 + 리뷰 PB 적립.
//   POST /api/review { author, handle?, store?, placeId?, rating?, caption?, location?, scanId? }
//
// 인증은 두 가지가 맞물려 성립한다.
//   · 매장 — 회원이 검색해서 지점까지 고른다(placeId). 서버는 그 id 로 원본을 되찾아
//     쓰므로, 클라이언트가 보낸 주소·버닝 여부를 믿지 않는다.
//   · 방문 — 영수증이 맡는다(scanId). 영수증이 답하는 것은 '영수증이 맞나 / 언제
//     얼마를 썼나 / 중복이 아닌가' 이고, 매장이 어디인지는 답하지 않는다.
// 그리고 둘을 맞춰 본다 — 영수증 주소의 구(區)가 고른 매장과 같은가.
//
// 버닝 여부는 서버가 정한다. 예전에는 클라이언트가 보낸 burning 값을 그대로 믿어서,
// 유저가 버닝 매장인 줄 모르고 '일반 리뷰'로 올리면 10PB 대신 2PB만 들어갔다.
// 이제는 매장명을 등록된 버닝 매장과 대조해 같은 곳이면 자동으로 승격시킨다.
//
// 부정 인증은 막지 않고 점수만 매긴다(정책: 지급은 하되 플래그). 위험 신호가 있는
// 건만 영수증 사진을 증거로 남기고 어드민 모더레이션 목록에 올린다.
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

    // ── 영수증 판독 결과 이어받기 ──
    const scan = await takeScan(String(b?.scanId || ''), uid);

    // ── 고른 매장 되찾기 ──
    // id 만 받고 원본은 서버가 들고 있던 것을 쓴다. 주소·버닝 여부를 클라이언트가
    // 보내게 하면 그걸 믿는 셈이 되기 때문이다(예전에 burning 을 클라가 보내던
    // 시절과 같은 실수). 못 찾으면 직접 입력한 것과 같게 취급한다.
    const place = lookupPlace(String(b?.placeId || ''));

    // ── 버닝 판정(서버 권위) ──
    // 고른 매장의 이름으로 등록 매장을 조회한다. 등록 매장이면 지금 시점의 리워드가
    // 나오고, 아니면 일반 2PB 다. 매장을 못 고른 경우에만 적어 넣은 이름을 쓴다.
    const resolved = await resolveStore(place?.name || typedStore);
    const storeName = resolved.storeName || place?.name || typedStore;

    // ── 위험 신호 모으기 ──
    const flagCodes: string[] = [];
    if (!scan) {
      flagCodes.push('shot_missing');
    } else {
      // 영수증 판독이 매긴 신호를 그대로 이어받는다
      // (영수증 아님 · 못 읽음 · 날짜 없음/오래됨/미래 · 촬영 정보).
      flagCodes.push(...scan.receipt.flags);

      // 중복은 무엇이 겹쳤는지에 따라 무게가 다르다. 영수증 고유키는 재촬영·크롭에도
      // 그대로라 가장 강하고, 글자 지문이 겹친 건 내가 낸 것이면 재제출로 본다.
      if (scan.dupKind === 'receipt') flagCodes.push('dup_receipt');
      else if (scan.dupKind === 'image') flagCodes.push('dup_image');
      else if (scan.dupKind === 'text') {
        flagCodes.push(scan.dupOf === uid ? 'dup_text' : 'dup_image');
      }
    }

    // ── 고른 매장과 영수증 맞춰 보기 ──
    let placeCheck = { state: 'unknown' as 'confirmed' | 'mismatch' | 'unknown', how: '' };
    if (!place) {
      flagCodes.push('place_missing');
      placeCheck = { state: 'unknown', how: '매장을 목록에서 고르지 않음' };
    } else if (scan) {
      placeCheck = checkPlaceAgainstReceipt(place, {
        address: scan.receipt.hints.address,
        phone: scan.receipt.hints.phone,
      });
      if (placeCheck.state === 'mismatch') flagCodes.push('place_mismatch');
      else if (placeCheck.state === 'unknown') flagCodes.push('place_unconfirmed');
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
      // '검증됨' = 매장을 골랐고, 영수증으로 읽혔고, 중복이 아니고, 둘이 어긋나지 않음.
      // 영수증에 주소가 안 찍혀 대조를 못 한 경우(unknown)까지 막지는 않는다 — 그건
      // 그 영수증에 정보가 없는 것이지 회원의 잘못이 아니다.
      verified:
        !!place && !!scan && scan.receipt.isReceipt && !scan.dupOf &&
        placeCheck.state !== 'mismatch',
      // 고른 매장 — 어디까지 확정된 값인지 함께 남긴다.
      place: place
        ? {
            id: place.id,
            name: place.name,
            address: place.address,
            phone: place.phone,
            lat: place.lat,
            lng: place.lng,
            check: placeCheck.state,
            checkHow: placeCheck.how,
          }
        : null,
      // 영수증에서 읽은 사실. 사업자등록번호는 상호 표기가 흔들려도 같은 매장을
      // 하나로 묶는 고유키라, 어드민 검수와 나중의 매장 집계를 위해 남긴다.
      receipt: scan
        ? {
            bizNo: scan.receipt.hints.bizNo,
            at: scan.receipt.at,
            total: scan.receipt.total,
            confidence: scan.receipt.confidence,
          }
        : null,
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

        // 지역 판별 — 회원이 고른 매장이 있으면 거기서 끝난다. 지점까지 특정된
        // 주소라 추측할 것이 없다. 예전에는 매장명·본문에서 지역을 긁어내야 했고,
        // 그래서 '지역을 판별하지 못함' 플래그가 필요했다.
        if (place?.region) {
          region = place.region;
        } else {
          let source = `${resolved.region || ''} ${resolved.address || ''}`.trim();
          // 영수증 주소에는 구(區)까지 찍혀 있어 등록 주소만큼 정확하다.
          if (!source) source = scan?.receipt?.hints?.address || '';
          if (!source.trim()) source = `${b?.district || ''} ${b?.location || ''}`;
          if (!source.trim()) source = `${rec.store} ${rec.caption}`;
          const matched = matchRegion(source);
          region = matched ? regionKey(matched) : '';
        }
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
          'dup_receipt',
          'dup_image',
          'dup_text',
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

    // 판독 뒷정리 — 지문을 남긴다. 이걸로 같은 영수증 재제출이 잡힌다.
    // 영수증 고유키는 다시 찍거나 잘라내도 그대로라, 이미지 지문만 남기던 예전보다
    // 확실하다(예전에는 재촬영 한 번이면 byteHash·textHash 가 둘 다 바뀌었다).
    if (scan) {
      await rememberShot({
        byteHash: scan.byteHash,
        textHash: scan.textHash,
        receiptKey: scan.receiptKey,
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

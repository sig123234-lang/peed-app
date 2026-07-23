import * as districts from './_districts';
import { readUid, readUserCookie } from './_session';
import { addStamp } from './_stamps';
import { getJSON, putJSON, storeConfigured } from './_store';
import * as wallet from './_wallet';

// Public: 앱에서 작성한 리뷰를 서버에 저장 → 어드민의 당첨자 후기 자동 매칭 + 리뷰 PB 적립.
//   POST /api/review { author, handle?, store?, rating?, caption?, burning?, district?, location? }
//   (로그인 쿠키가 있으면) 리뷰 PB 적립: 버닝 10 / 일반 2. 매장당 하루 1회.
//   같은 구(區)에서 리뷰 5개마다 +1 PB 도장 보너스.
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
    const uid = readUid(readUserCookie(req.headers?.cookie));
    const reviews = await getJSON<any[]>('v2/reviews.json', []);
    const rec: any = {
      id: `rv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      uid: uid || '',
      author,
      handle,
      store: String(b?.store || '').trim(),
      rating: Number(b?.rating) || 0,
      caption: String(b?.caption || '').slice(0, 500),
      burning: !!b?.burning,
      verified: !!b?.verified,
      platform: String(b?.platform || '').trim().slice(0, 40),
      createdAt: Date.now(),
      date: new Date().toISOString().slice(0, 10),
    };

    // 리뷰 PB 적립 — 로그인 유저 한정, 같은 매장 하루 1회만(어뷰징 방지).
    let award = 0;
    let balance = 0;
    let bonusPb = 0;
    let district = '';
    let districtCount = 0;
    if (uid) {
      const dup = reviews.some(
        (r) => r.uid === uid && r.store === rec.store && r.date === rec.date && r.awarded
      );
      if (!dup && rec.store) {
        award = rec.burning ? 10 : 2;
        balance = await wallet.credit(uid, award, rec.burning ? '버닝 리뷰 적립' : '리뷰 적립');
        rec.awarded = true;

        // 구(區) 판별 — 클라 제공 우선, 없으면 지역/매장/내용에서 추출, 버닝은 매장 주소로 보강.
        district = districts.extractDistrict(String(b?.district || ''));
        if (!district && rec.burning) {
          const stores = await getJSON<any[]>('v2/stores.json', []);
          const st = stores.find((s) => s.storeName === rec.store);
          if (st) district = districts.extractDistrict(`${st.address || ''} ${st.region || ''}`);
        }
        if (!district) {
          district = districts.extractDistrict(`${rec.store} ${b?.location || ''} ${rec.caption}`);
        }
        rec.district = district;

        if (district) {
          await addStamp(uid, district); // 패스포트에 구 도장 표시
          const r = await districts.bump(uid, district);
          districtCount = r.count;
          if (r.bonus) {
            bonusPb = 1;
            balance = await wallet.credit(uid, 1, `${district} 리뷰 ${r.count}개 달성 도장 보너스`);
          }
        }
      } else {
        balance = await wallet.getBalance(uid);
      }
    }

    reviews.unshift(rec);
    await putJSON('v2/reviews.json', reviews.slice(0, 3000));
    res.status(200).json({ ok: true, id: rec.id, award, bonusPb, district, districtCount, balance });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: 'review_failed', detail: String(e?.message || e) });
  }
}

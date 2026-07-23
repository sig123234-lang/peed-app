import { requireAdmin } from '../_auth';

// 네이버 플레이스 URL → 매장 정보/사진/좌표 자동 추출.
//   POST /api/admin/naver-place { url }
//   → { ok, placeId, name, category, roadAddress, address, region, phone, lat, lng, photos[] }
//
// 네이버가 공개 API를 제공하지 않아 모바일 플레이스 페이지의 임베디드 JSON/메타를
// best-effort 파싱한다. 구조가 바뀌어도 최대한 부분 데이터라도 돌려준다.

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';

const FETCH_HEADERS = {
  'User-Agent': UA,
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  Referer: 'https://m.place.naver.com/',
};

// 짧은 링크(naver.me) / 리다이렉트를 따라가 최종 URL을 얻는다.
async function resolveUrl(raw: string): Promise<string> {
  try {
    const r = await fetch(raw, { headers: FETCH_HEADERS, redirect: 'follow' });
    return r.url || raw;
  } catch {
    return raw;
  }
}

// URL(그리고 필요 시 본문)에서 네이버 place id(숫자)를 추출.
function extractPlaceId(url: string, body?: string): string | null {
  const dec = (() => {
    try {
      return decodeURIComponent(url);
    } catch {
      return url;
    }
  })();
  const pats = [
    /place\/(\d{5,})/,
    /entry\/place\/(\d{5,})/,
    /(?:restaurant|cafe|hairshop|hospital|beauty|attraction|accommodation|place|store)\/(\d{5,})/,
    /placePath=%2F[a-z]+%2F(\d{5,})/i,
    /[?&]id=(\d{5,})/,
  ];
  for (const p of pats) {
    const m = dec.match(p) || url.match(p);
    if (m) return m[1];
  }
  if (body) {
    const m =
      body.match(/"placeId"\s*:\s*"?(\d{5,})"?/) ||
      body.match(/place\/(\d{5,})/) ||
      body.match(/"id"\s*:\s*"(\d{7,})"/);
    if (m) return m[1];
  }
  return null;
}

// 원본(수 MB) 대신 네이버 리사이즈 프록시 URL로 변환 → 빠른 로딩.
const resized = (u: string, type = 'f640_640'): string =>
  `https://search.pstatic.net/common/?type=${type}&src=${encodeURIComponent(u)}`;

const first = (s: string, res: RegExp[]): string => {
  for (const re of res) {
    const m = s.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return '';
};

const METRO_MAP: Record<string, string> = {
  서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천',
  광주광역시: '광주', 대전광역시: '대전', 울산광역시: '울산', 세종특별자치시: '세종',
  경기도: '경기', 강원도: '강원', 강원특별자치도: '강원', 충청북도: '충북', 충청남도: '충남',
  전라북도: '전북', 전북특별자치도: '전북', 전라남도: '전남', 경상북도: '경북', 경상남도: '경남',
  제주도: '제주', 제주특별자치도: '제주',
};
const metroShort = (roadOrAddr: string): string => {
  const tok = (roadOrAddr || '').trim().split(/\s+/)[0] || '';
  if (METRO_MAP[tok]) return METRO_MAP[tok];
  return tok.replace(/(특별자치시|특별자치도|특별시|광역시|자치도)$/, '').replace(/도$/, '');
};

function decodeEntities(s: string): string {
  return (s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/');
}

// 주소 → 좌표 (OpenStreetMap Nominatim, 무료). 스크레이핑 좌표 실패 시 폴백.
async function geocodeAddr(q: string): Promise<{ lat: number; lng: number } | null> {
  const query = (q || '').trim();
  if (!query) return null;
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=kr&q=${encodeURIComponent(
        query
      )}`,
      { headers: { 'User-Agent': 'peed-admin/1.0 (https://peed.co.kr)' } }
    );
    if (!r.ok) return null;
    const arr = await r.json();
    if (Array.isArray(arr) && arr[0]) return { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) };
    return null;
  } catch {
    return null;
  }
}

function parsePlace(html: string) {
  const name = decodeEntities(
    first(html, [
      /<meta property="og:title" content="([^"]+)"/,
      /"name"\s*:\s*"([^"]{1,80})"/,
    ])
  ).replace(/\s*:\s*네이버.*$/, '');

  const category = decodeEntities(
    first(html, [/"category"\s*:\s*"([^"]{1,40})"/, /"categoryName"\s*:\s*"([^"]{1,40})"/])
  );

  const roadAddress = decodeEntities(
    first(html, [/"roadAddress"\s*:\s*"([^"]{2,120})"/, /"roadaddr"\s*:\s*"([^"]{2,120})"/])
  );
  const address = decodeEntities(
    first(html, [/"address"\s*:\s*"([^"]{2,120})"/, /"jibunAddress"\s*:\s*"([^"]{2,120})"/])
  );

  const phone = decodeEntities(
    first(html, [/"virtualPhone"\s*:\s*"([0-9\-]{7,20})"/, /"phone"\s*:\s*"([0-9\-]{7,20})"/])
  );

  // 좌표: x=경도, y=위도. 한국 범위로 검증.
  let lat = 0;
  let lng = 0;
  const xy =
    html.match(/"x"\s*:\s*"?(1[0-9]{2}\.\d{3,})"?[^}]{0,40}?"y"\s*:\s*"?(3[0-9]\.\d{3,})"?/) ||
    html.match(/"y"\s*:\s*"?(3[0-9]\.\d{3,})"?[^}]{0,40}?"x"\s*:\s*"?(1[0-9]{2}\.\d{3,})"?/);
  if (xy) {
    const a = parseFloat(xy[1]);
    const b = parseFloat(xy[2]);
    // 첫 그룹이 경도(1xx)인지 위도(3x)인지 패턴에 따라 배치.
    if (a > 100) {
      lng = a;
      lat = b;
    } else {
      lat = a;
      lng = b;
    }
  } else {
    const lo = first(html, [/"longitude"\s*:\s*"?(1[0-9]{2}\.\d{3,})"?/]);
    const la = first(html, [/"latitude"\s*:\s*"?(3[0-9]\.\d{3,})"?/]);
    if (lo && la) {
      lng = parseFloat(lo);
      lat = parseFloat(la);
    }
  }

  // 사진: 네이버 플레이스 사진 DB(ldb-phinf.pstatic.net 등)의 원본 URL 수집.
  // HTML 내 슬래시가 /로 이스케이프돼 있어 먼저 정규화한다.
  const norm = html.replace(/\\u002[fF]/g, '/').replace(/\\\//g, '/');
  const imgSet = new Set<string>();
  const og = first(html, [/<meta property="og:image" content="([^"]+)"/]);
  if (og) imgSet.add(decodeEntities(og).split('?')[0]);
  const re = /https?:\/\/[a-z0-9.\-]*phinf\.pstatic\.net\/[^\s"'\\)]+?\.(?:jpe?g|png)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm)) && imgSet.size < 16) {
    const u = m[0].split('?')[0];
    // 프로필/아이콘/파비콘/맵 애셋 제외 → 실제 매장 사진만.
    if (/clip-service|profileimage|favicon|assets\/shared|sprite|blank|maps-/i.test(u)) continue;
    imgSet.add(u);
  }
  const photos = Array.from(imgSet).slice(0, 8);

  // 메뉴·가격: 임베디드 JSON의 {name..price} 쌍 추출.
  const menus: { name: string; price: number }[] = [];
  const seenMenu = new Set<string>();
  const mre =
    /"name"\s*:\s*"([^"]{1,40})"\s*,\s*(?:"[^"]+"\s*:\s*[^,{}]+,\s*){0,8}?"price"\s*:\s*"?([0-9,]{3,9})"?/g;
  let mm: RegExpExecArray | null;
  while ((mm = mre.exec(html)) && menus.length < 40) {
    const mname = decodeEntities(mm[1]).trim();
    const price = Number(mm[2].replace(/,/g, ''));
    if (!mname || mname === name) continue;
    if (!(price >= 500 && price <= 3000000)) continue;
    const key = mname.toLowerCase();
    if (seenMenu.has(key)) continue;
    seenMenu.add(key);
    menus.push({ name: mname, price });
  }

  return { name, category, roadAddress, address, phone, lat, lng, photos, menus };
}

export default async function handler(req: any, res: any) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
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
  const url = String(b?.url || '').trim();
  if (!/naver/i.test(url)) {
    res.status(400).json({ ok: false, error: 'not_naver_url' });
    return;
  }

  try {
    const finalUrl = await resolveUrl(url);
    let placeId = extractPlaceId(finalUrl);

    // 업종 경로(restaurant/cafe/hairshop…) 파악: 최종 URL 또는 m.place 리다이렉트에서.
    const typeFrom = (u: string): string => {
      const m = (u || '').match(
        /\.com\/(restaurant|cafe|hairshop|hospital|beauty|attraction|accommodation|place|store)\/\d/
      );
      return m && m[1] !== 'place' ? m[1] : '';
    };
    let typePath = typeFrom(finalUrl);
    let probeHtml = '';
    if (placeId && !typePath) {
      try {
        const probe = await fetch(`https://m.place.naver.com/place/${placeId}/home`, {
          headers: FETCH_HEADERS,
          redirect: 'follow',
        });
        typePath = typeFrom(probe.url) || 'restaurant';
        probeHtml = await probe.text();
      } catch {
        typePath = 'restaurant';
      }
    }
    if (!typePath) typePath = 'restaurant';

    // pcmap(사진·좌표가 풍부한 SSR 페이지)을 우선 시도.
    const candidates = placeId
      ? [
          `https://pcmap.place.naver.com/${typePath}/${placeId}/home`,
          `https://pcmap.place.naver.com/restaurant/${placeId}/home`,
          `https://m.place.naver.com/${typePath}/${placeId}/home`,
        ]
      : [finalUrl];

    let html = '';
    for (const c of candidates) {
      try {
        const r = await fetch(c, { headers: FETCH_HEADERS, redirect: 'follow' });
        if (!r.ok) continue;
        const t = await r.text();
        if (!placeId) placeId = extractPlaceId(r.url || c, t);
        // 사진 DB 링크가 있으면 최상. 없으면 주소라도 있으면 채택.
        if (t.includes('ldb-phinf.pstatic.net')) {
          html = t;
          break;
        }
        if (!html && (t.includes('"roadAddress"') || t.includes('"address"'))) html = t;
      } catch {
        // 다음 후보
      }
    }
    if (!html) html = probeHtml;

    if (!html) {
      res.status(200).json({ ok: false, placeId, error: 'fetch_failed' });
      return;
    }

    const data = parsePlace(html);
    const region = metroShort(data.roadAddress || data.address);

    // 좌표를 못 찾았지만 주소가 있으면 지오코딩으로 보완 → 지도 등록 보장.
    if ((!data.lat || !data.lng) && (data.roadAddress || data.address)) {
      const geo = await geocodeAddr(data.roadAddress || data.address);
      if (geo) {
        data.lat = geo.lat;
        data.lng = geo.lng;
      }
    }

    res.status(200).json({
      ok: !!(data.name || data.photos.length || data.lat),
      placeId,
      sourceUrl: finalUrl,
      region,
      ...data,
      photos: data.photos.map((u) => resized(u)),
    });
  } catch (e: any) {
    res.status(200).json({ ok: false, error: 'parse_failed', detail: String(e?.message || e) });
  }
}

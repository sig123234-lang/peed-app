# PEED 서버 독립 운영 안내

Vercel · Supabase 없이 이 서버 한 대에서 전부 돌아갑니다.

| 주소 | 용도 |
|---|---|
| **https://43-200-104-183.nip.io** | 일반 사용자 앱 |
| **https://admin.43-200-104-183.nip.io** | 관리자 콘솔 |

앱은 호스트명이 `admin.` 으로 시작하면 관리자 콘솔로 전환합니다
(`app/_layout.tsx` 의 `isAdminHost`). 서브도메인 없이 `?admin=1` 을 붙여도 같습니다.
관리자 계정은 `admin@peed.co.kr` 이며, 비밀번호 해시는 `api/admin/login.ts` 에 있습니다.

---

## 1. 무엇이 어떻게 바뀌었나

| 기능 | 전 (Vercel/Supabase) | 후 (이 서버) |
|---|---|---|
| 데이터 저장 | Vercel Blob (`v2/*.json`) | `/home/ubuntu/peed-data/v2/*.json` |
| 이미지 업로드 | Vercel Blob | `/home/ubuntu/peed-data/v2/img/` |
| 이미지 서빙 | `/api/blob?k=…` (프록시) | 경로 동일 — 로컬 파일을 읽어 서빙 |
| API 실행 | Vercel 서버리스 함수 | `server/index.mjs` (Node 단일 프로세스) |
| DM 채팅 | Supabase Postgres + Realtime | 로컬 JSON + **2초 폴링** |
| 음성통화 | LiveKit | **비활성** (키 넣으면 재활성) |
| 로그인 세션 | HMAC 쿠키 | 그대로 (원래 외부 의존 없음) |
| HTTPS·도메인 | Vercel | Caddy + Let's Encrypt (자동 갱신) |
| 리뷰 캡처 판독 | — | **Tesseract 5 (kor+eng)** — 서버에 직접 설치, 외부 AI API 없음 |

### 시스템 패키지 (서버를 새로 만들 때 반드시 설치)

리뷰 인증은 네이버 '리뷰 쓰기 완료' 캡처를 서버에서 읽어 매장명·별점·본문을
자동으로 채웁니다(`api/_ocr.ts`). Tesseract 가 없으면 오류가 나지는 않고 자동
입력만 조용히 꺼지므로(유저가 직접 입력), 빠뜨려도 눈치채기 어렵습니다.

```sh
sudo apt-get install -y tesseract-ocr tesseract-ocr-kor tesseract-ocr-eng
tesseract --list-langs   # eng, kor 이 보여야 정상
```

캡처 한 장에 약 3.5초 / 90MB 를 씁니다. 동시 실행은 2건으로 제한되어 있고
(`PEED_OCR_PARALLEL`), `peed.service` 의 `MemoryMax=1200M` 안에서 넉넉합니다.
실행 파일 경로가 다르면 `PEED_TESSERACT` 로 지정할 수 있습니다.

`nip.io` 는 IP 를 그대로 도메인으로 바꿔주는 무료 DNS 입니다.
`43-200-104-183.nip.io` → `43.200.104.183`. 별도 등록·비용 없습니다.

---

## 2. 구성 요소

```
인터넷 → :443 Caddy (HTTPS 종료, gzip) → :3000 Node (peed.service) → /home/ubuntu/peed-data
```

| 항목 | 위치 |
|---|---|
| 앱 소스 | `/home/ubuntu/peed-app` |
| 웹 빌드 결과 | `/home/ubuntu/peed-app/dist` |
| API 번들 | `/home/ubuntu/peed-app/server/build/routes.mjs` |
| 설정 | `/home/ubuntu/peed-app/.env` (권한 600) |
| 데이터 | `/home/ubuntu/peed-data` |
| systemd | `/etc/systemd/system/peed.service` |
| Caddy 설정 | `/etc/caddy/Caddyfile` |

---

## 3. 자주 쓰는 명령

```bash
# 상태 확인 / 재시작 / 로그
sudo systemctl status peed
sudo systemctl restart peed
sudo journalctl -u peed -f

# 코드를 고친 뒤 반영
cd /home/ubuntu/peed-app
npm run build          # 웹 빌드 + API 번들 (5~10분)
sudo systemctl restart peed

# API 코드만 고쳤을 때 (30초)
npm run build:api && sudo systemctl restart peed
```

---

## 4. 소셜 로그인 켜기

`.env` 의 빈칸을 채우고 `sudo systemctl restart peed` 하면 끝입니다.
각 개발자 콘솔에 **아래 주소를 그대로** 등록해야 합니다.

| 제공자 | 콘솔 | 등록할 Redirect URI |
|---|---|---|
| 카카오 | developers.kakao.com | `https://43-200-104-183.nip.io/api/auth/callback/kakao` |
| 네이버 | developers.naver.com | `https://43-200-104-183.nip.io/api/auth/callback/naver` |
| 구글 | console.cloud.google.com | `https://43-200-104-183.nip.io/api/auth/callback/google` |

콜백 주소는 `.env` 의 `PUBLIC_BASE_URL` 로부터 자동으로 만들어집니다.
나중에 진짜 도메인(`peed.co.kr`)을 붙이면 그 값만 바꾸면 됩니다.

키가 비어 있으면 로그인 버튼은 `/?login=notconfigured&provider=…` 로 되돌아옵니다
(제공자 페이지에서 오류가 나는 대신).

---

## 5. 음성통화 다시 켜기

`.env` 의 `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` 세 값을 채우고 재시작하면 됩니다.
코드는 그대로 남아 있고, 값이 없을 때만 SDK 를 로드하지 않습니다.

---

## 6. 백업

데이터는 전부 `/home/ubuntu/peed-data` 안의 JSON + 이미지 파일입니다.

```bash
tar czf ~/peed-backup-$(date +%F).tar.gz -C /home/ubuntu peed-data
```

---

## 7. 알아둘 점

- **폴링 주기**: 화면을 보고 있을 때 2초, 탭이 가려지면 15초입니다.
  `context/dm.tsx` 의 `POLL_MS` 로 조절합니다. 짧게 할수록 실시간에 가깝지만 요청이 늘어납니다.
- **데이터 규모**: JSON 파일 기반이라 회원 수천 명 수준까지는 문제없지만,
  그 이상으로 커지면 SQLite 같은 DB 로 옮기는 게 좋습니다.
  저장 계층이 `api/_store.ts` 한 곳에 모여 있어 교체 지점이 명확합니다.
- **nip.io 주소**: 서버 IP 가 바뀌면 주소도 바뀝니다.
  그때는 `.env` 의 `PUBLIC_BASE_URL`, `/etc/caddy/Caddyfile` 의 호스트명,
  그리고 소셜 로그인 콘솔의 Redirect URI 를 함께 고쳐야 합니다.
- **포트**: AWS 보안그룹에서 80·443 만 열려 있습니다. 3000 번은 외부에서 막혀 있고,
  Node 서버도 `127.0.0.1` 만 듣기 때문에 Caddy 를 거치지 않고는 접근할 수 없습니다.

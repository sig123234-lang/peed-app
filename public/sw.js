/* PEED 서비스 워커 — 웹푸시 수신 전용.
   앱이 닫혀 있어도 브라우저가 이 파일을 깨워서 알림을 띄운다.
   오프라인 캐싱은 하지 않는다(캐싱을 넣으면 배포 후 옛 화면이 남는 문제가 생긴다). */

self.addEventListener('install', (e) => {
  // 새 워커를 즉시 활성화 — 배포 후 다음 방문부터 바로 새 코드가 돈다.
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'PEED', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'PEED';
  const options = {
    body: data.body || '',
    // 왼쪽 동그라미 = badge(알림 아이콘). 투명 배경 + 흰색 PEED 워드마크라
    // 안드로이드가 흑백 실루엣으로 처리해도 로고가 그대로 보인다.
    // (예전엔 icon-192.png 를 badge 로 써서 투명영역이 없어 흰 덩어리로 나왔다.)
    badge: '/badge.png',
    // icon(오른쪽 큰 썸네일)은 일부러 뺀다 — 왼쪽 로고 하나로 정리.
    // 다시 오른쪽에 로고를 띄우려면 아래 줄 주석을 풀면 된다.
    // icon: '/icon-192.png',
    // 같은 tag 는 하나로 합쳐진다(메시지 도배 방지). 당첨은 매번 따로 보이게 한다.
    tag: data.tag || 'peed',
    renotify: data.tag === 'raffle',
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  // 항상 새 페이지로 연다. 보던 화면을 밀어내지 않아서, 알림을 확인해도
  // 원래 하던 작업(작성 중인 글 등)이 그대로 남는다.
  event.waitUntil(self.clients.openWindow ? self.clients.openWindow(target) : Promise.resolve());
});

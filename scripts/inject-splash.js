// Post-build: inject a web loading splash (blue bg + big PEED) into the exported
// dist/index.html. Expo's static export strips custom +html.tsx body content, so
// we patch the shell HTML directly. Runs after `expo export --platform web`.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'dist', 'index.html');
if (!fs.existsSync(file)) {
  console.log('[splash] dist/index.html not found — skip');
  process.exit(0);
}

let html = fs.readFileSync(file, 'utf8');
if (html.includes('id="peed-splash"')) {
  console.log('[splash] already injected — skip');
  process.exit(0);
}

const STYLE = `<style>
#peed-splash{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#6275D8;transition:opacity .45s ease}
#peed-splash.peed-hide{opacity:0;pointer-events:none}
#peed-splash .peed-word{font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-weight:800;letter-spacing:3px;color:#F6F7FB;font-size:clamp(52px,15vw,132px);line-height:1;animation:peedPulse 1.25s ease-in-out infinite}
@keyframes peedPulse{0%,100%{opacity:.72;transform:scale(1)}50%{opacity:1;transform:scale(1.045)}}
/* 한글 줄바꿈: 단어(어절) 중간에서 끊기지 않게. 너무 긴 토큰만 예외로 줄바꿈. */
body *{word-break:keep-all;overflow-wrap:break-word}
</style>`;

// 어드민(?admin=1 또는 admin. 서브도메인)에선 스플래시를 즉시 숨김(깜빡임 없이).
const SPLASH = `<div id="peed-splash"><span class="peed-word">PEED</span></div><script>(function(){try{if(/[?&]admin=1/.test(location.search)||location.hostname.indexOf('admin.')===0){var e=document.getElementById('peed-splash');if(e)e.parentNode.removeChild(e);}}catch(x){}})();</script>`;

const SCRIPT = `<script>
(function(){var s=document.getElementById('peed-splash');if(!s)return;function hide(){s.classList.add('peed-hide');setTimeout(function(){if(s&&s.parentNode)s.parentNode.removeChild(s);},500);}var root=document.getElementById('root');if(root){if(root.childNodes.length>0){setTimeout(hide,150);return;}var mo=new MutationObserver(function(){if(root.childNodes.length>0){mo.disconnect();setTimeout(hide,180);}});mo.observe(root,{childList:true});}setTimeout(hide,8000);})();
</script>`;

// PWA 설치 아이콘: 고해상도 매니페스트/아이콘으로 연결(자동 생성 중복은 제거).
html = html.replace(/<link[^>]+rel=["']manifest["'][^>]*>/gi, '');
html = html.replace(/<link[^>]+rel=["']apple-touch-icon["'][^>]*>/gi, '');
html = html.replace(/<meta[^>]+name=["']theme-color["'][^>]*>/gi, '');
const HEAD =
  '<link rel="manifest" href="/manifest.json">' +
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">' +
  '<link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png">' +
  '<meta name="theme-color" content="#6275D8">' +
  '<meta name="mobile-web-app-capable" content="yes">' +
  '<meta name="apple-mobile-web-app-capable" content="yes">' +
  '<meta name="apple-mobile-web-app-title" content="PEED">';

// viewport-fit=cover → 스탠드얼론 PWA에서 env(safe-area-inset-*) 활성화
// (안드로이드 하단 제스처바만큼 하단바가 올라오도록).
html = html.replace(
  /(<meta\s+name=["']viewport["'][^>]*content=["'])([^"']*)(["'])/i,
  (m, a, c, z) => (/viewport-fit/.test(c) ? m : `${a}${c}, viewport-fit=cover${z}`)
);

// 1) head tags + style → before </head>
html = html.replace('</head>', `${HEAD}${STYLE}</head>`);
// 2) splash div → right after <body ...>
html = html.replace(/(<body[^>]*>)/i, `$1${SPLASH}`);
// 3) hide script → before </body>
html = html.replace('</body>', `${SCRIPT}</body>`);

fs.writeFileSync(file, html);
console.log('[splash] injected PEED loading splash into dist/index.html');

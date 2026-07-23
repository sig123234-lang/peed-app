import { execFileSync } from 'child_process';
import path from 'path';

import * as esbuild from 'esbuild';

// api/*.ts 를 하나의 ESM 번들로 묶는다. 서버는 이 번들만 import 하면 되므로
// 런타임에 TypeScript 를 해석할 필요가 없다.
const HERE = import.meta.dirname;

execFileSync(process.execPath, [path.join(HERE, 'gen-routes.mjs')], { stdio: 'inherit' });

await esbuild.build({
  entryPoints: [path.join(HERE, 'routes.entry.ts')],
  outfile: path.join(HERE, 'build', 'routes.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  // 음성통화가 켜졌을 때만 동적으로 로드된다 — 번들에 넣지 않고 런타임 해석에 맡긴다.
  // CommonJS 패키지는 번들에 넣으면 ESM 출력에서 require() 가 깨진다.
  // 런타임에 node_modules 에서 직접 불러오도록 제외한다.
  external: ['livekit-server-sdk', 'web-push'],
  logLevel: 'info',
});

console.log('API 번들 완료 → server/build/routes.mjs');

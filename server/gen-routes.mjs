import fs from 'fs';
import path from 'path';

// api/ 폴더를 훑어 라우트 진입점을 만든다.
// 규칙은 Vercel과 동일: `_` 로 시작하는 파일은 내부 모듈, `export default` 가 있는
// 나머지 파일이 라우트. 이렇게 해두면 나중에 api/ 에 파일을 추가해도 빌드만 다시 돌리면 된다.
const ROOT = path.resolve(import.meta.dirname, '..');
const API = path.join(ROOT, 'api');

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile() && e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

const routes = [];
for (const file of walk(API).sort()) {
  const rel = path.relative(API, file).replace(/\\/g, '/');
  if (rel.split('/').some((seg) => seg.startsWith('_'))) continue;
  if (!/export\s+default/.test(fs.readFileSync(file, 'utf8'))) continue;
  routes.push({ url: `/api/${rel.replace(/\.ts$/, '')}`, rel });
}

const imports = routes
  .map((r, i) => `import h${i} from '../api/${r.rel.replace(/\.ts$/, '')}';`)
  .join('\n');
const table = routes.map((r, i) => `  ${JSON.stringify(r.url)}: h${i},`).join('\n');

const src = `// 자동 생성 파일 — server/gen-routes.mjs 가 만든다. 직접 수정하지 말 것.
${imports}

export const routes: Record<string, (req: any, res: any) => any> = {
${table}
};

// 스케줄러가 쓰는 작업 — 라우트가 아니라 서버가 주기적으로 직접 부른다.
export { runDueDraws } from '../api/_draw';
`;

fs.writeFileSync(path.join(import.meta.dirname, 'routes.entry.ts'), src);
console.log(`라우트 ${routes.length}개 생성:`);
for (const r of routes) console.log(`  ${r.url}`);

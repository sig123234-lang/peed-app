// 자동 생성 파일 — server/gen-routes.mjs 가 만든다. 직접 수정하지 말 것.
import h0 from '../api/admin/data';
import h1 from '../api/admin/login';
import h2 from '../api/admin/naver-place';
import h3 from '../api/admin/session';
import h4 from '../api/admin/upload';
import h5 from '../api/ads';
import h6 from '../api/auth';
import h7 from '../api/blob';
import h8 from '../api/products';
import h9 from '../api/public';
import h10 from '../api/review';
import h11 from '../api/stores';

export const routes: Record<string, (req: any, res: any) => any> = {
  "/api/admin/data": h0,
  "/api/admin/login": h1,
  "/api/admin/naver-place": h2,
  "/api/admin/session": h3,
  "/api/admin/upload": h4,
  "/api/ads": h5,
  "/api/auth": h6,
  "/api/blob": h7,
  "/api/products": h8,
  "/api/public": h9,
  "/api/review": h10,
  "/api/stores": h11,
};

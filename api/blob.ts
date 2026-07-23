import { getBinary } from './_store';

// 이미지 프록시 — 로컬 저장소(v2/img/)의 파일을 스트리밍한다.
// 원래 Vercel Blob 비공개 스토어를 감추기 위한 프록시였고, 경로 규약(/api/blob?k=…)을
// 그대로 유지해서 이미 저장된 URL들이 계속 동작하게 한다. v2/img/ 접두사만 허용.
export default async function handler(req: any, res: any) {
  const k = String(req.query?.k || '');
  if (!k.startsWith('v2/img/')) {
    res.status(400).end();
    return;
  }
  try {
    const f = await getBinary(k);
    if (!f) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', f.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(200).send(f.buf);
  } catch {
    res.status(500).end();
  }
}

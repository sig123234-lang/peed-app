import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import { colors, radius, shadow, spacing, type } from '@/theme';

// 상단바와 본문이 공유하는 최대 폭. 한 값에서 나와야 좌측 기준선이 어긋나지 않는다.
const CONTENT_MAX = 1100;

const BURNING_MONTHLY_FEE = 200000; // 버닝 매장 월 구독료
const PRIZE_BUDGET_RATE = 0.5; // 구독 매출의 50%를 경품 구매에
const PB_PER_BURNING = 10; // 버닝 매장 리뷰 시 지급 PB
const PB_PER_REGULAR = 1; // 일반 매장 리뷰 시 지급 PB

// 영업 파이프라인 단계 (리드 → 활성). '활성'만 앱 지도에 노출·과금.
const STAGES = ['리드', '컨택', '제안', '협상', '계약', '활성'];
const OPEN_STAGES = ['리드', '컨택', '제안', '협상', '계약']; // 진행 중(=파이프라인)
const STAGE_COLOR: Record<string, string> = {
  리드: '#94A3B8',
  컨택: '#4F6BFF',
  제안: '#6C5CE7',
  협상: '#F59E0B',
  계약: '#22C55E',
  활성: '#0EA5A5',
  이탈: '#EF4444',
};
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const api = (path: string, opts?: RequestInit) =>
  fetch(`/api/admin/${path}`, { credentials: 'include', ...opts });

const won = (n: number) =>
  `${Math.round(n || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')}원`;

// 월 구독 인보이스 — 새 창에 세금계산서형 HTML을 그려 인쇄(=PDF 저장).
function printInvoice(s: any) {
  if (typeof window === 'undefined') return;
  const w = window.open('', '_blank', 'width=800,height=960');
  if (!w) return;
  const fee = Number(s.monthlyFee) || BURNING_MONTHLY_FEE;
  const supply = Math.round(fee / 1.1);
  const vat = fee - supply;
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const invNo = `PEED-${ym.replace('-', '')}-${String(s.id || '').slice(-4).toUpperCase() || '0001'}`;
  const money = (n: number) => n.toLocaleString('ko-KR') + '원';
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${invNo}</title>
<style>
  *{box-sizing:border-box;font-family:-apple-system,'Malgun Gothic',sans-serif}
  body{margin:0;padding:48px;color:#1a1f36}
  .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #4F6BFF;padding-bottom:20px}
  .brand{font-size:28px;font-weight:900;color:#4F6BFF;letter-spacing:-1px}
  .brand span{color:#1a1f36}
  h1{font-size:20px;margin:28px 0 4px}
  .muted{color:#8a90a6;font-size:13px}
  table{width:100%;border-collapse:collapse;margin-top:24px}
  th,td{padding:12px 14px;text-align:left;font-size:14px}
  thead th{background:#f4f6fb;color:#5a607a;font-size:12px;border-bottom:1px solid #e6e9f2}
  tbody td{border-bottom:1px solid #eef0f6}
  .r{text-align:right}
  .tot{display:flex;justify-content:flex-end;margin-top:16px}
  .tot .box{width:280px}
  .tot .row{display:flex;justify-content:space-between;padding:7px 0;font-size:14px}
  .tot .grand{border-top:2px solid #1a1f36;margin-top:8px;padding-top:12px;font-size:18px;font-weight:900}
  .grid{display:flex;gap:40px;margin-top:24px}
  .grid .col{flex:1}
  .k{font-size:12px;color:#8a90a6;margin-bottom:2px}
  .v{font-size:14px;font-weight:700;margin-bottom:12px}
  .foot{margin-top:48px;color:#8a90a6;font-size:12px;text-align:center;border-top:1px solid #eef0f6;padding-top:20px}
  @media print{body{padding:24px}.noprint{display:none}}
</style></head><body>
  <div class="top">
    <div><div class="brand">PEED<span> 청구서</span></div><div class="muted" style="margin-top:6px">버닝 매장 월 구독</div></div>
    <div style="text-align:right"><div class="k">인보이스 번호</div><div class="v">${invNo}</div><div class="k">발행일</div><div class="v">${now.toISOString().slice(0, 10)}</div></div>
  </div>
  <div class="grid">
    <div class="col"><div class="k">공급자</div><div class="v">PEED (피드)</div><div class="k">문의</div><div class="v">admin@peed.co.kr</div></div>
    <div class="col"><div class="k">공급받는 자 (매장)</div><div class="v">${s.storeName || '-'}</div><div class="k">담당자 · 연락처</div><div class="v">${s.ownerName || '-'} · ${s.contact || '-'}</div><div class="k">지역</div><div class="v">${s.region || '-'}${s.address ? ' · ' + s.address : ''}</div></div>
  </div>
  <table><thead><tr><th>항목</th><th class="r">공급가액</th><th class="r">부가세</th><th class="r">합계</th></tr></thead>
  <tbody><tr><td>버닝 매장 월 구독료 (${ym})</td><td class="r">${money(supply)}</td><td class="r">${money(vat)}</td><td class="r">${money(fee)}</td></tr></tbody></table>
  <div class="tot"><div class="box">
    <div class="row"><span>공급가액</span><span>${money(supply)}</span></div>
    <div class="row"><span>부가세 (10%)</span><span>${money(vat)}</span></div>
    <div class="row grand"><span>합계</span><span>${money(fee)}</span></div>
  </div></div>
  <div class="foot">본 청구서는 PEED 관리자에서 자동 생성되었습니다 · 결제 상태: ${s.paymentStatus || '미결제'}</div>
  <div class="noprint" style="text-align:center;margin-top:24px"><button onclick="window.print()" style="padding:12px 32px;background:#4F6BFF;color:#fff;border:0;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer">인쇄 / PDF 저장</button></div>
</body></html>`;
  w.document.write(html);
  w.document.close();
}

// 오버레이(모달/패널)가 떠 있는 동안 뒤 배경 스크롤 잠금. 중첩 대비 카운터 사용.
let scrollLockCount = 0;
function setLock(on: boolean) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('admin-scroll');
  const val = on ? 'hidden' : '';
  if (el) (el as HTMLElement).style.overflow = val;
  document.body.style.overflow = val;
  (document.documentElement as HTMLElement).style.overflow = val;
}
function useScrollLock() {
  useEffect(() => {
    scrollLockCount += 1;
    if (scrollLockCount === 1) setLock(true);
    return () => {
      scrollLockCount = Math.max(0, scrollLockCount - 1);
      if (scrollLockCount === 0) setLock(false);
    };
  }, []);
}

// 오버레이를 document.body 최상위로 포탈 → 스크롤 컨테이너를 벗어나 뷰포트 전체를
// 확실히 덮는다. 웹 전용(관리자는 웹에서만 렌더되므로 네이티브에선 그대로 렌더).
function Portal({ children }: { children: React.ReactNode }) {
  if (typeof document === 'undefined') return <>{children}</>;
  // 네이티브 번들에서 실행되지 않도록 지연 require.
  const createPortal = require('react-dom').createPortal as (
    c: React.ReactNode,
    el: Element
  ) => any;
  return createPortal(children, document.body);
}

// 파괴적 작업 확인 (관리자는 웹 전용이므로 window.confirm 사용).
function confirmAction(msg: string): boolean {
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return window.confirm(msg);
  }
  return true;
}

// 초경량 토스트 — 모듈 이벤트 + Console에 마운트된 ToastHost가 렌더.
type ToastItem = { id: number; msg: string; kind: 'ok' | 'err' };
let toastListeners: ((t: ToastItem) => void)[] = [];
let toastSeq = 0;
function toast(msg: string, kind: 'ok' | 'err' = 'ok') {
  const t: ToastItem = { id: ++toastSeq, msg, kind };
  toastListeners.forEach((l) => l(t));
}
function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const l = (t: ToastItem) => {
      setItems((p) => [...p, t]);
      setTimeout(() => setItems((p) => p.filter((x) => x.id !== t.id)), 2600);
    };
    toastListeners.push(l);
    return () => {
      toastListeners = toastListeners.filter((x) => x !== l);
    };
  }, []);
  if (!items.length) return null;
  return (
    <View style={styles.toastWrap} pointerEvents="none">
      {items.map((t) => (
        <View key={t.id} style={[styles.toast, t.kind === 'err' && styles.toastErr]}>
          <Ionicons
            name={t.kind === 'err' ? 'alert-circle' : 'checkmark-circle'}
            size={16}
            color="#fff"
          />
          <Text style={styles.toastText}>{t.msg}</Text>
        </View>
      ))}
    </View>
  );
}

/* ============================================================ shell/auth */

export type AdminIdentity = {
  name: string;
  position: string;
  sup: boolean;
  canManageStaff: boolean;
};

export function AdminApp() {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);

  const checkSession = () =>
    api('session')
      .then((r) => r.json())
      .then((d) => {
        setAuthed(!!d.authed);
        setIdentity(
          d.authed
            ? { name: d.name || '', position: d.position || '', sup: !!d.sup, canManageStaff: !!d.canManageStaff }
            : null
        );
      })
      .catch(() => setAuthed(false))
      .finally(() => setChecking(false));

  useEffect(() => {
    checkSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checking) {
    return (
      <View style={styles.splash}>
        <Logo />
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
      </View>
    );
  }
  return authed ? (
    <Console
      identity={identity}
      onLogout={() => {
        setAuthed(false);
        setIdentity(null);
      }}
    />
  ) : (
    <Login onSuccess={() => checkSession()} />
  );
}

function Logo({ dark }: { dark?: boolean }) {
  return (
    <Text style={[styles.logo, dark && { color: '#FFFFFF' }]}>
      PEED{' '}
      <Text style={[styles.logoAdmin, dark && { color: 'rgba(255,255,255,0.55)' }]}>admin</Text>
    </Text>
  );
}

function Badge({ value }: { value: string }) {
  const good = ['active', '완료', '발송', '활성', '계약', '결제완료', '처리완료', '재직', '발급완료', '수령완료', '작성완료'].includes(value);
  const warn = [
    'pending', '준비', 'suspended', 'inactive', 'ended', 'rejected',
    '이탈', '연체', '미결제', '리드', 'draft', '퇴사', '추첨대기', '마감', '처리중', '미작성',
  ].includes(value);
  const bg = good ? colors.primarySoft : warn ? colors.coralSoft : colors.surfaceAlt;
  const fg = good ? colors.primary : warn ? colors.coralDeep : colors.textSecondary;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <View style={[styles.badgeDot, { backgroundColor: fg }]} />
      <Text style={[styles.badgeText, { color: fg }]}>{value || '-'}</Text>
    </View>
  );
}

// Lightweight bar chart drawn with Views (no chart lib).
function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={styles.chart}>
      {data.map((d, i) => (
        <View key={i} style={styles.chartCol}>
          <View style={styles.chartBarTrack}>
            <View style={[styles.chartBar, { height: `${(d.value / max) * 100}%` }]} />
          </View>
          <Text style={styles.chartLabel}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}

function Login({ onSuccess }: { onSuccess: () => void }) {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!id || !pw || loading) return;
    setLoading(true);
    setError('');
    try {
      const r = await api('login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password: pw }),
      });
      if (r.ok) onSuccess();
      else setError('아이디 또는 비밀번호가 맞지 않아요.');
    } catch {
      setError('로그인 요청에 실패했어요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.loginWrap}>
      <View style={styles.loginCard}>
        <Logo />
        <Text style={styles.loginSub}>관리자 로그인</Text>
        <Text style={styles.label}>아이디</Text>
        <TextInput
          style={styles.input}
          value={id}
          onChangeText={setId}
          autoCapitalize="none"
          placeholder="admin@peed.co.kr"
          placeholderTextColor={colors.textTertiary}
        />
        <Text style={styles.label}>비밀번호</Text>
        <TextInput
          style={styles.input}
          value={pw}
          onChangeText={setPw}
          secureTextEntry
          onSubmitEditing={submit}
          placeholder="password"
          placeholderTextColor={colors.textTertiary}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity
          style={[styles.loginBtn, (!id || !pw) && { opacity: 0.5 }]}
          onPress={submit}
          disabled={!id || !pw || loading}
          activeOpacity={0.9}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.loginBtnText}>로그인</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ================================================================ console */

const SECTIONS = [
  { key: 'dashboard', label: '대시보드', icon: 'grid-outline' },
  { key: 'members', label: '회원 관리', icon: 'people-outline' },
  { key: 'staff', label: '직원 관리', icon: 'id-card-outline' },
  { key: 'burning', label: '버닝 매장', icon: 'flame-outline' },
  { key: 'campaigns', label: '슈퍼 버닝', icon: 'rocket-outline' },
  { key: 'products', label: '상품(경품)', icon: 'gift-outline' },
  { key: 'shipments', label: '배송·수여', icon: 'cube-outline' },
  { key: 'posts', label: '게시물 관리', icon: 'images-outline' },
  { key: 'reservations', label: '예약 관리', icon: 'calendar-outline' },
  { key: 'reports', label: '모더레이션', icon: 'shield-checkmark-outline' },
  { key: 'ads', label: '광고 관리', icon: 'megaphone-outline' },
  { key: 'finance', label: '매출·지출', icon: 'card-outline' },
  { key: 'pb', label: 'PB 원장', icon: 'diamond-outline' },
  { key: 'notices', label: '공지·알림', icon: 'notifications-outline' },
] as const;

type Field = {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'select' | 'image';
  options?: string[];
};

const SCHEMAS: Record<
  string,
  { title: string; fields: Field[]; columns: string[]; addLabel: string }
> = {
  members: {
    title: '회원 관리',
    addLabel: '회원 추가',
    fields: [
      { key: 'name', label: '이름' },
      { key: 'handle', label: '아이디' },
      { key: 'pb', label: 'PB', type: 'number' },
      { key: 'status', label: '상태', type: 'select', options: ['active', 'suspended'] },
      { key: 'role', label: '권한', type: 'select', options: ['user', 'vip', 'admin'] },
      { key: 'joinedAt', label: '가입일' },
    ],
    columns: ['name', 'handle', 'pb', 'role', 'status'],
  },
  products: {
    title: '상품(경품) 관리',
    addLabel: '상품 등록',
    fields: [
      { key: 'image', label: '사진', type: 'image' },
      { key: 'name', label: '상품명' },
      { key: 'pbCost', label: '응모 비용 (1회)', type: 'number' },
      { key: 'price', label: '시가(원)', type: 'number' },
      { key: 'winners', label: '당첨 인원', type: 'number' },
      { key: 'stock', label: '응모 한도', type: 'number' },
      { key: 'status', label: '상태', type: 'select', options: ['active', 'ended'] },
    ],
    columns: ['image', 'name', 'pbCost', 'price', 'stock', 'status'],
  },
  campaigns: {
    title: '슈퍼 버닝 캠페인',
    addLabel: '캠페인 생성',
    fields: [
      { key: 'name', label: '캠페인명' },
      { key: 'stores', label: '참여 매장 수', type: 'number' },
      { key: 'feePerStore', label: '매장당 모금(원)', type: 'number' },
      { key: 'prize', label: '경품' },
      { key: 'reqPb', label: '응모 필요 PB', type: 'number' },
      { key: 'startAt', label: '시작일' },
      { key: 'endAt', label: '종료일' },
      { key: 'status', label: '상태', type: 'select', options: ['모집중', '진행중', '종료'] },
    ],
    columns: ['name', 'stores', 'prize', 'status'],
  },
  reports: {
    title: '콘텐츠 모더레이션',
    addLabel: '신고 등록',
    fields: [
      { key: 'target', label: '대상 (리뷰/유저)' },
      { key: 'reason', label: '사유', type: 'select', options: ['허위 리뷰', '중복 리뷰', '부적절', '스팸', '기타'] },
      { key: 'reporter', label: '신고자' },
      { key: 'pbClaw', label: 'PB 회수', type: 'number' },
      { key: 'status', label: '처리', type: 'select', options: ['pending', '처리완료', '반려'] },
    ],
    columns: ['target', 'reason', 'pbClaw', 'status'],
  },
  notices: {
    title: '공지 · 알림',
    addLabel: '공지 작성',
    fields: [
      { key: 'title', label: '제목' },
      { key: 'body', label: '내용' },
      { key: 'audience', label: '대상', type: 'select', options: ['전체', '회원', '매장'] },
      { key: 'status', label: '상태', type: 'select', options: ['active', 'draft'] },
      { key: 'date', label: '게시일' },
    ],
    columns: ['title', 'audience', 'status'],
  },
  shipments: {
    title: '배송 · 수여 관리',
    addLabel: '배송 추가',
    fields: [
      { key: 'winnerName', label: '당첨자' },
      { key: 'product', label: '상품' },
      { key: 'address', label: '주소' },
      { key: 'contact', label: '연락처' },
      { key: 'tracking', label: '송장번호' },
      { key: 'status', label: '상태', type: 'select', options: ['추첨대기', '준비', '발송', '완료'] },
    ],
    columns: ['product', 'winnerName', 'tracking', 'status'],
  },
  staff: {
    title: '직원 관리',
    addLabel: '직원 추가',
    fields: [
      { key: 'name', label: '이름' },
      { key: 'position', label: '직무', type: 'select', options: ['영업', '영업팀장', '운영', '마케팅', '관리자', '기타'] },
      { key: 'phone', label: '연락처' },
      { key: 'email', label: '이메일' },
      { key: 'status', label: '상태', type: 'select', options: ['재직', '퇴사'] },
      { key: 'joinedAt', label: '입사일' },
    ],
    columns: ['name', 'position', 'phone', 'status'],
  },
  ads: {
    title: '광고 관리',
    addLabel: '광고 등록',
    fields: [
      { key: 'image', label: '배너 이미지', type: 'image' },
      { key: 'title', label: '광고명' },
      {
        key: 'placement',
        label: '노출 위치',
        type: 'select',
        options: ['피드 상단', '버닝맵', '경품', '마이'],
      },
      { key: 'link', label: '링크' },
      { key: 'status', label: '상태', type: 'select', options: ['active', 'inactive'] },
      { key: 'startAt', label: '시작일' },
      { key: 'endAt', label: '종료일' },
    ],
    columns: ['image', 'title', 'placement', 'status'],
  },
};

/* 공지 → 전체 회원 앱 알림 발송. 공지를 '게시'하는 것과 '알리는' 것은 다른 행동이라
   목록에서 명시적으로 누를 때만 나간다(저장할 때 자동 발송하지 않는다). */
const SEND_NOTICE_ACTION = {
  icon: 'megaphone-outline',
  onPress: async (item: any) => {
    const title = String(item?.title || '').trim();
    if (!title) {
      toast('제목이 없는 공지는 보낼 수 없어요', 'err');
      return;
    }
    if (!confirmAction(`'${title}'\n\n전체 회원에게 앱 알림으로 보낼까요?`)) return;
    try {
      const r = await api('data?c=members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'notify',
          all: true,
          type: 'notice',
          title,
          body: String(item?.body || '').slice(0, 300),
        }),
      });
      const d = await r.json();
      toast(d?.ok ? `${d.sent}명에게 알림을 보냈어요` : '발송 실패', d?.ok ? 'ok' : 'err');
    } catch {
      toast('발송 실패', 'err');
    }
  },
};

const COLLECTION_SUB: Record<string, string> = {
  members: '회원 조회 · PB · 상태 · 권한',
  staff: '내부 직원 · 영업 담당은 매장 배정 시 이 목록에서 선택돼요',
  products: '경품 등록(사진 포함) · 응모 1회 = 설정 PB 차감 · 많이 모을수록 여러 번 응모',
  shipments: '당첨자 수여 · 배송 상태 · 송장 관리',
  ads: '배너 광고 · 노출 위치 · 기간',
  campaigns: '매장 모금 → 초대형 경품 슈퍼버닝 캠페인',
  reports: '허위·중복·신고 리뷰 검수 → PB 회수',
  notices: '앱 공지 · 푸시 알림',
};

function Console({ identity, onLogout }: { identity: AdminIdentity | null; onLogout: () => void }) {
  const [section, setSection] = useState<string>('dashboard');
  const [navOpen, setNavOpen] = useState(false);
  const { width } = useWindowDimensions();
  const isMobile = width < 900;

  const logout = async () => {
    try {
      await api('session', { method: 'POST' });
    } catch {
      // ignore
    }
    onLogout();
  };

  // 직원 관리는 관리자·인사 직무만 노출.
  const canStaff = identity ? identity.canManageStaff : true;
  const visibleSections = SECTIONS.filter((s) => s.key !== 'staff' || canStaff);
  // 권한 없는 섹션을 보고 있으면 대시보드로.
  useEffect(() => {
    if (!canStaff && section === 'staff') setSection('dashboard');
  }, [canStaff, section]);
  const cur = SECTIONS.find((s) => s.key === section);
  const go = (key: string) => {
    setSection(key);
    if (isMobile) setNavOpen(false);
  };

  const sidebarBody = (
    <>
      <View style={styles.sideLogo}>
        <Logo dark />
      </View>
      <Text style={styles.sideKicker}>SNS 관리</Text>
      {visibleSections.map((s) => {
        const active = section === s.key;
        return (
          <TouchableOpacity
            key={s.key}
            style={[styles.navItem, active && styles.navItemActive]}
            onPress={() => go(s.key)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={s.icon as any}
              size={18}
              color={active ? '#FFFFFF' : 'rgba(255,255,255,0.5)'}
            />
            <Text style={[styles.navLabel, active && styles.navLabelActive]}>{s.label}</Text>
          </TouchableOpacity>
        );
      })}
      <View style={{ flex: 1 }} />
      <TouchableOpacity style={styles.navItem} onPress={logout} activeOpacity={0.8}>
        <Ionicons name="log-out-outline" size={18} color="rgba(255,255,255,0.5)" />
        <Text style={styles.navLabel}>로그아웃</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <View style={styles.consoleRoot}>
      <ToastHost />
      {!isMobile && <View style={styles.sidebar}>{sidebarBody}</View>}

      <View style={styles.mainCol}>
        {/* 상단바 안쪽을 아래 본문과 같은 폭·여백으로 묶는다. 그래야 페이지 제목과
            본문 첫 줄의 왼쪽 끝이 한 선에 맞는다. */}
        <View style={styles.topbar}>
          <View style={[styles.topbarInner, isMobile && styles.topbarInnerMobile]}>
            <View style={styles.topbarLeft}>
              {isMobile ? (
                <TouchableOpacity style={styles.hamburger} onPress={() => setNavOpen(true)} hitSlop={8}>
                  <Ionicons name="menu" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
              ) : null}
              <Text style={styles.topbarTitle} numberOfLines={1}>{cur?.label}</Text>
            </View>
            <View style={styles.adminChip}>
              <View style={styles.adminAvatar}>
                <Text style={styles.adminAvatarText}>{(identity?.name || 'A').slice(0, 1)}</Text>
              </View>
              {!isMobile ? (
                <Text style={styles.adminChipText}>
                  {identity?.name || '관리자'}
                  {identity?.position ? ` · ${identity.position}` : ''}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
        <ScrollView
          nativeID="admin-scroll"
          style={styles.contentPane}
          contentContainerStyle={[styles.contentInner, isMobile && styles.contentInnerMobile]}
        >
          {section === 'dashboard' && <DashboardView onGo={setSection} />}
          {section === 'burning' && <SalesCRM />}
          {section === 'finance' && <FinanceView />}
          {section === 'products' && <ProductsSection />}
          {section === 'members' && <MembersSection />}
          {section === 'pb' && <PbLedgerView />}
          {section === 'staff' && canStaff && <StaffSection />}
          {section === 'shipments' && <ShipmentsSection />}
          {section === 'posts' && <PostsSection />}
          {section === 'reservations' && <ReservationsSection />}
          {!['products', 'members', 'pb', 'staff', 'shipments', 'posts', 'reservations'].includes(
            section
          ) && SCHEMAS[section] ? (
            <CollectionManager
              key={section}
              collection={section}
              {...SCHEMAS[section]}
              // 공지는 목록에서 바로 전체 회원에게 앱 알림으로 쏠 수 있게 한다.
              extraAction={section === 'notices' ? SEND_NOTICE_ACTION : undefined}
            />
          ) : null}
        </ScrollView>
      </View>

      {/* 모바일: 햄버거로 여는 사이드 드로어 */}
      {isMobile && navOpen ? (
        <View style={styles.mobileNav}>
          <View style={[styles.sidebar, styles.mobileNavPanel]}>{sidebarBody}</View>
          <TouchableOpacity
            style={styles.mobileNavBackdrop}
            activeOpacity={1}
            onPress={() => setNavOpen(false)}
          />
        </View>
      ) : null}
    </View>
  );
}

/* ============================================================== dashboard */

function DashboardView({ onGo }: { onGo: (s: string) => void }) {
  const [members, setMembers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [apps, setApps] = useState<any[]>([]);
  const [pbEvents, setPbEvents] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);

  useEffect(() => {
    api('data?c=members').then((r) => r.json()).then((d) => setMembers(d.items || [])).catch(() => {});
    api('data?c=products').then((r) => r.json()).then((d) => setProducts(d.items || [])).catch(() => {});
    api('data?c=stores').then((r) => r.json()).then((d) => setApps(d.items || [])).catch(() => {});
    api('data?c=pb_events').then((r) => r.json()).then((d) => setPbEvents(d.items || [])).catch(() => {});
    api('data?c=audit').then((r) => r.json()).then((d) => setAudit(d.items || [])).catch(() => {});
  }, []);

  const pbIssued = pbEvents.filter((e) => e.type === 'issue').reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const pbSpent = pbEvents.filter((e) => e.type === 'spend').reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const approved = apps.filter((a) => a.stage === '활성').length;
  const pending = apps.filter((a) => OPEN_STAGES.includes(a.stage)).length;
  const monthly = approved * BURNING_MONTHLY_FEE;

  const revenue = monthly;
  const prizeBudget = Math.round(revenue * PRIZE_BUDGET_RATE);
  const totalPb = members.reduce((s, m) => s + (Number(m.pb) || 0), 0);
  const prizeValue = products.reduce((s, p) => s + (Number(p.price) || 0), 0);
  const budgetUse = prizeBudget > 0 ? Math.min(1, prizeValue / prizeBudget) : 0;
  // Real monthly MRR: active stores whose contract date is on/before each month.
  const nowD = new Date();
  const chartData = Array.from({ length: 6 }, (_, idx) => {
    const i = 5 - idx;
    const d = new Date(nowD.getFullYear(), nowD.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const activeByThen = apps.filter(
      (a) => a.stage === '활성' && a.contractDate && String(a.contractDate).slice(0, 7) <= key
    ).length;
    return { label: i === 0 ? '이번달' : `${d.getMonth() + 1}월`, value: activeByThen * BURNING_MONTHLY_FEE };
  });
  const recent = apps.slice(0, 5);

  return (
    <View>
      <SectionTitle
        title="경영 대시보드"
        sub="매장 구독 → 경품 풀 → 응모 매력 → 방문·리뷰. 플라이휠을 한눈에."
      />

      <View style={styles.kpiRow}>
        <Kpi icon="people" label="총 회원" value={`${members.length}`} onPress={() => onGo('members')} />
        <Kpi icon="flame" label="버닝 매장" value={`${approved}`} onPress={() => onGo('burning')} />
        <Kpi icon="cash" label="이번 달 매출" value={won(revenue)} onPress={() => onGo('finance')} />
        <Kpi icon="gift" label="경품 예산 (50%)" value={won(prizeBudget)} accent onPress={() => onGo('products')} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>비즈니스 플라이휠</Text>
        <View style={styles.flywheel}>
          <FlyNode icon="flame" label="버닝 매장" value={`${approved}곳`} />
          <FlyArrow />
          <FlyNode icon="cash" label="월 구독" value={won(revenue)} />
          <FlyArrow />
          <FlyNode icon="gift" label="경품 예산" value={won(prizeBudget)} accent />
          <FlyArrow />
          <FlyNode icon="diamond" label="유통 PB" value={`${totalPb}`} />
          <FlyArrow />
          <FlyNode icon="people" label="방문·리뷰" value={`${members.length}명`} />
        </View>
      </View>

      <View style={styles.dashRow}>
        <View style={styles.dashCardLg}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>월별 매출 (버닝 구독)</Text>
            <Text style={styles.cardBig}>{won(revenue)}</Text>
          </View>
          <BarChart data={chartData} />
        </View>
        <View style={styles.dashCardSm}>
          <Text style={styles.cardTitle}>경품 예산 집행</Text>
          <Text style={styles.gaugePct}>{Math.round(budgetUse * 100)}%</Text>
          <View style={styles.gaugeTrack}>
            <View style={[styles.gaugeFill, { width: `${budgetUse * 100}%` }]} />
          </View>
          <View style={styles.gaugeLegend}>
            <Text style={styles.gaugeLegendLabel}>등록 상품 시가</Text>
            <Text style={styles.gaugeLegendVal}>{won(prizeValue)}</Text>
          </View>
          <View style={[styles.gaugeLegend, styles.rowLast]}>
            <Text style={styles.gaugeLegendLabel}>경품 예산</Text>
            <Text style={styles.gaugeLegendVal}>{won(prizeBudget)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.dashRow}>
        <View style={styles.dashCardSm}>
          <Text style={styles.cardTitle}>PB 경제</Text>
          <View style={styles.pbRow}>
            <Text style={styles.pbLabel}>유통 PB (부채)</Text>
            <Text style={styles.pbVal}>{totalPb} PB</Text>
          </View>
          <View style={styles.pbRow}>
            <Text style={styles.pbLabel}>총 발행</Text>
            <Text style={styles.pbVal}>{pbIssued} PB</Text>
          </View>
          <View style={[styles.pbRow, styles.rowLast]}>
            <Text style={styles.pbLabel}>총 사용</Text>
            <Text style={[styles.pbVal, { color: colors.coral }]}>−{pbSpent} PB</Text>
          </View>
          <TouchableOpacity style={styles.cardLink} onPress={() => onGo('pb')}>
            <Text style={styles.linkText}>PB 원장 →</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.dashCardLg}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>최근 신청 · 대기 {pending}건</Text>
            <TouchableOpacity onPress={() => onGo('burning')}>
              <Text style={styles.linkText}>전체 →</Text>
            </TouchableOpacity>
          </View>
          {recent.length === 0 ? (
            <Text style={styles.muted}>신청 내역이 없어요.</Text>
          ) : (
            recent.map((a, ri) => (
              <View key={a.id} style={[styles.recentRow, ri === recent.length - 1 && styles.rowLast]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recentName} numberOfLines={1}>{a.storeName}</Text>
                  <Text style={styles.recentMeta} numberOfLines={1}>{a.region}</Text>
                </View>
                <Badge value={a.stage} />
              </View>
            ))
          )}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>최근 변경 이력 (감사 로그)</Text>
        {audit.length === 0 ? (
          <Text style={styles.muted}>기록된 변경이 없어요.</Text>
        ) : (
          audit.slice(0, 8).map((a) => (
            <View key={a.id} style={styles.auditRow}>
              <View style={[styles.auditDot, { backgroundColor: AUDIT_COLOR[a.action] || colors.textTertiary }]} />
              <Text style={styles.auditText} numberOfLines={1}>
                <Text style={{ fontWeight: '800', color: colors.textPrimary }}>
                  {COLLECTION_KO[a.collection] || a.collection}
                </Text>
                {`  ${AUDIT_ACTION_KO[a.action] || a.action} · ${a.label || a.itemId}`}
              </Text>
              <Text style={styles.auditWhen}>{String(a.at || '').slice(5, 16).replace('T', ' ')}</Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const COLLECTION_KO: Record<string, string> = {
  stores: '버닝매장',
  members: '회원',
  products: '경품',
  shipments: '배송',
  ads: '광고',
  ledger: '재무',
  campaigns: '슈퍼버닝',
  reports: '모더레이션',
  notices: '공지',
  pb_events: 'PB',
};
const AUDIT_ACTION_KO: Record<string, string> = { create: '추가', update: '수정', delete: '삭제' };
const AUDIT_COLOR: Record<string, string> = { create: '#22C55E', update: '#4F6BFF', delete: '#EF4444' };

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={styles.h1}>{title}</Text>
      {sub ? <Text style={styles.sectionSub}>{sub}</Text> : null}
    </View>
  );
}

function FlyNode({
  icon,
  label,
  value,
  accent,
}: {
  icon: string;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.flyNode}>
      <View style={[styles.flyIcon, accent && { backgroundColor: colors.coralSoft }]}>
        <Ionicons name={icon as any} size={18} color={accent ? colors.coral : colors.primary} />
      </View>
      <Text style={styles.flyVal} numberOfLines={1}>{value}</Text>
      <Text style={styles.flyLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function FlyArrow() {
  return <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} style={{ marginHorizontal: 2 }} />;
}

function Kpi({
  label,
  value,
  accent,
  icon,
  onPress,
}: {
  label: string;
  value: string;
  accent?: boolean;
  icon?: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={styles.kpiCard} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.kpiIcon, accent && { backgroundColor: colors.coralSoft }]}>
        <Ionicons
          name={(icon || 'ellipse') as any}
          size={18}
          color={accent ? colors.coral : colors.primary}
        />
      </View>
      <Text style={[styles.kpiValue, accent && { color: colors.coral }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

/* =============================================================== burning */

// 단계별 성사 확률 (파이프라인 가중 매출 예측용).
const STAGE_WIN_PROB: Record<string, number> = {
  리드: 0.1,
  컨택: 0.2,
  제안: 0.4,
  협상: 0.6,
  계약: 0.85,
  활성: 1,
};

function SalesCRM() {
  const [stores, setStores] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [q, setQ] = useState('');
  const [view, setView] = useState<'board' | 'analytics'>('board');
  const [csvOpen, setCsvOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pipeline' | 'ended'>('all');
  const [showForm, setShowForm] = useState(false); // 코크핏 → 정보수정 폼 전환
  // 딜 열기: 기존 매장은 코크핏, 신규는 폼(아래 렌더에서 id 유무로 분기).
  const open = (s: any) => {
    setShowForm(false);
    setEditing(s);
  };

  const refresh = async () => {
    try {
      const r = await api('data?c=stores');
      const d = await r.json();
      setStores(Array.isArray(d.items) ? d.items : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
    api('data?c=staff').then((r) => r.json()).then((d) => setStaff(d.items || [])).catch(() => {});
  }, []);
  const staffNames = staff.filter((s) => s.status !== '퇴사').map((s) => s.name).filter(Boolean);

  const save = async (item: any) => {
    const action = item.id ? 'update' : 'create';
    await api('data?c=stores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, item }),
    });
    setEditing(null);
    toast(action === 'create' ? '매장이 추가되었습니다' : '저장되었습니다');
    refresh();
  };
  const del = async (id: string) => {
    const s = stores.find((x) => x.id === id);
    if (!confirmAction(`'${s?.storeName || '매장'}' 딜을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    await api('data?c=stores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    });
    setEditing(null);
    setShowForm(false);
    toast('삭제되었습니다');
    refresh();
  };
  // 코크핏 인라인 저장: 창을 닫지 않고 반영.
  const persist = async (item: any) => {
    setEditing(item);
    setStores((prev) => prev.map((s) => (s.id === item.id ? item : s)));
    await api('data?c=stores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', item }),
    });
    refresh();
  };

  const list = q.trim()
    ? stores.filter((s) =>
        JSON.stringify(Object.values(s)).toLowerCase().includes(q.trim().toLowerCase())
      )
    : stores;
  const active = stores.filter((s) => s.stage === '활성');
  const pipeline = stores.filter((s) => OPEN_STAGES.includes(s.stage));
  const today = todayStr();
  const overdue = stores.filter(
    (s) => OPEN_STAGES.includes(s.stage) && s.nextActionDate && s.nextActionDate < today
  );
  // 상태별 그룹 (검색어 반영).
  const activeG = list.filter((s) => s.stage === '활성');
  const pipelineG = list.filter((s) => OPEN_STAGES.includes(s.stage));
  const endedG = list.filter((s) => s.stage === '이탈');
  const STATUS_TABS = [
    { k: 'all', label: '전체', n: list.length },
    { k: 'active', label: '🔥 활성', n: activeG.length },
    { k: 'pipeline', label: '📞 영업중', n: pipelineG.length },
    { k: 'ended', label: '⛔ 종료·이탈', n: endedG.length },
  ] as const;

  return (
    <View>
      <View style={styles.h1Row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>버닝 매장 영업 (CRM)</Text>
          <Text style={styles.sectionSub}>
            리드 → 컨택 → 제안 → 협상 → 계약 → 활성. 파이프라인이 곧 매출.
          </Text>
        </View>
        <TouchableOpacity style={styles.addBtnGhost} onPress={() => setCsvOpen(true)}>
          <Ionicons name="cloud-upload-outline" size={17} color={colors.primary} />
          <Text style={styles.addBtnGhostText}>CSV 대량등록</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() =>
            setEditing({
              stage: '리드',
              monthlyFee: BURNING_MONTHLY_FEE,
              source: '영업',
              paymentStatus: '미결제',
              activities: [],
            })
          }
        >
          <Ionicons name="add" size={18} color={colors.white} />
          <Text style={styles.addBtnText}>매장 추가</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.kpiRow}>
        <Kpi icon="pulse" label="파이프라인" value={`${pipeline.length}건`} />
        <Kpi icon="cash" label="예상 월 매출" value={won(pipeline.length * BURNING_MONTHLY_FEE)} />
        <Kpi icon="flame" label="활성 MRR" value={won(active.length * BURNING_MONTHLY_FEE)} />
        <Kpi icon="alert-circle" label="방치 딜" value={`${overdue.length}`} accent />
      </View>

      <View style={styles.segRow}>
        <TouchableOpacity
          style={[styles.segBtn, view === 'board' && styles.segBtnOn]}
          onPress={() => setView('board')}
        >
          <Ionicons name="albums-outline" size={15} color={view === 'board' ? colors.white : colors.textSecondary} />
          <Text style={[styles.segText, view === 'board' && styles.segTextOn]}>파이프라인</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segBtn, view === 'analytics' && styles.segBtnOn]}
          onPress={() => setView('analytics')}
        >
          <Ionicons name="stats-chart-outline" size={15} color={view === 'analytics' ? colors.white : colors.textSecondary} />
          <Text style={[styles.segText, view === 'analytics' && styles.segTextOn]}>영업 분석</Text>
        </TouchableOpacity>
      </View>

      {view === 'analytics' ? (
        <CrmAnalytics stores={stores} />
      ) : (
        <>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          value={q}
          onChangeText={setQ}
          placeholder="매장·담당·지역 검색"
          placeholderTextColor={colors.textTertiary}
        />
        <Text style={styles.countText}>{list.length}건</Text>
      </View>

      <View style={styles.statusRow}>
        {STATUS_TABS.map((t) => (
          <TouchableOpacity
            key={t.k}
            style={[styles.statusChip, statusFilter === t.k && styles.statusChipOn]}
            onPress={() => setStatusFilter(t.k)}
          >
            <Text style={[styles.statusChipText, statusFilter === t.k && styles.statusChipTextOn]}>
              {t.label} {t.n}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} />
      ) : (
        <>
          {/* 🔥 활성 매장 — 구독 중(매출 발생). 한눈에 보는 리스트. */}
          {(statusFilter === 'all' || statusFilter === 'active') && (
            <View style={styles.storeGroup}>
              <View style={styles.groupHead}>
                <Text style={styles.groupTitle}>🔥 활성 매장</Text>
                <Text style={styles.groupMeta}>
                  {activeG.length}곳 · MRR {won(activeG.length * BURNING_MONTHLY_FEE)}
                </Text>
              </View>
              {activeG.length === 0 ? (
                <Empty text="활성(구독 중) 매장이 없어요." />
              ) : (
                <View style={styles.table}>
                  <View style={[styles.tr, styles.trHead]}>
                    <Text style={[styles.th, { flex: 1.6 }]}>매장</Text>
                    <Text style={[styles.th, { flex: 1 }]}>담당</Text>
                    <Text style={[styles.th, { flex: 1 }]}>지역</Text>
                    <Text style={[styles.th, { width: 90 }]}>결제</Text>
                    <Text style={[styles.th, { width: 100, textAlign: 'right' }]}>월 구독료</Text>
                  </View>
                  {activeG.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      style={styles.tr}
                      onPress={() => open(s)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.td, styles.tdStrong, { flex: 1.6 }]} numberOfLines={1}>
                        {s.storeName}
                      </Text>
                      <Text style={[styles.td, { flex: 1 }]} numberOfLines={1}>{s.salesRep || '미배정'}</Text>
                      <Text style={[styles.td, { flex: 1 }]} numberOfLines={1}>{s.region || '-'}</Text>
                      <View style={{ width: 90 }}>
                        <Badge value={s.paymentStatus || '미결제'} />
                      </View>
                      <Text style={[styles.td, { width: 100, textAlign: 'right' }]}>
                        {won(Number(s.monthlyFee) || BURNING_MONTHLY_FEE)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* 📞 영업 파이프라인 — 리드~계약 칸반. */}
          {(statusFilter === 'all' || statusFilter === 'pipeline') && (
            <View style={styles.storeGroup}>
              <View style={styles.groupHead}>
                <Text style={styles.groupTitle}>📞 영업 파이프라인</Text>
                <Text style={styles.groupMeta}>
                  {pipelineG.length}건 · 예상 {won(pipelineG.length * BURNING_MONTHLY_FEE)}
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator
                style={{ marginHorizontal: -spacing['2xl'] }}
                contentContainerStyle={{ paddingHorizontal: spacing['2xl'], gap: spacing.md }}
              >
                {OPEN_STAGES.map((stage) => {
                  const col = pipelineG.filter((s) => s.stage === stage);
                  return (
                    <View key={stage} style={styles.kanCol}>
                      <View style={styles.kanHead}>
                        <View style={[styles.stageDot, { backgroundColor: STAGE_COLOR[stage] }]} />
                        <Text style={styles.kanTitle}>{stage}</Text>
                        <Text style={styles.kanCount}>{col.length}</Text>
                      </View>
                      <Text style={styles.kanSum}>{won(col.length * BURNING_MONTHLY_FEE)}</Text>
                      {col.map((s) => {
                        const late = s.nextActionDate && s.nextActionDate < today;
                        return (
                          <TouchableOpacity
                            key={s.id}
                            style={styles.dealCard}
                            onPress={() => open(s)}
                            activeOpacity={0.85}
                          >
                            <Text style={styles.dealName} numberOfLines={1}>{s.storeName}</Text>
                            <Text style={styles.dealMeta} numberOfLines={1}>
                              {s.region}{s.category ? ` · ${s.category}` : ''}
                            </Text>
                            <View style={styles.dealFoot}>
                              <Text style={styles.dealRep}>{s.salesRep || '미배정'}</Text>
                              {s.nextActionDate ? (
                                <Text style={[styles.dealDate, late && { color: colors.coral, fontWeight: '800' }]}>
                                  {late ? '⚠ ' : ''}{s.nextActionDate}
                                </Text>
                              ) : null}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                      {col.length === 0 ? <Text style={styles.kanEmpty}>비어 있음</Text> : null}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* ⛔ 종료·이탈 — 계약 해지/이탈 매장. */}
          {(statusFilter === 'all' || statusFilter === 'ended') && (
            <View style={styles.storeGroup}>
              <View style={styles.groupHead}>
                <Text style={styles.groupTitle}>⛔ 종료·이탈</Text>
                <Text style={styles.groupMeta}>{endedG.length}곳</Text>
              </View>
              {endedG.length === 0 ? (
                <Empty text="종료·이탈 매장이 없어요." />
              ) : (
                <View style={styles.table}>
                  {endedG.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      style={styles.tr}
                      onPress={() => open(s)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.td, styles.tdStrong, { flex: 1.6 }]} numberOfLines={1}>
                        {s.storeName}
                      </Text>
                      <Text style={[styles.td, { flex: 1 }]} numberOfLines={1}>{s.region || '-'}</Text>
                      <Text style={[styles.td, { flex: 1 }]} numberOfLines={1}>{s.salesRep || '미배정'}</Text>
                      <View style={{ width: 70 }}>
                        <Badge value="이탈" />
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}
        </>
      )}
        </>
      )}

      {editing ? (
        !editing.id || showForm ? (
          <DealModal
            deal={editing}
            staffNames={staffNames}
            onClose={() => {
              setEditing(null);
              setShowForm(false);
            }}
            onSave={save}
            onDelete={del}
          />
        ) : (
          <DealCockpit
            deal={editing}
            onClose={() => setEditing(null)}
            onEdit={() => setShowForm(true)}
            onDelete={del}
            onPersist={persist}
          />
        )
      ) : null}
      {csvOpen ? (
        <CsvImportModal
          onClose={() => setCsvOpen(false)}
          onDone={() => {
            setCsvOpen(false);
            refresh();
          }}
        />
      ) : null}
    </View>
  );
}

// 리드 CSV 대량 등록 — 붙여넣기 → 파싱 → 일괄 생성.
function CsvImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(0);
  const parsed = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(',').map((c) => c.trim()))
    // 헤더 행 스킵.
    .filter((cols) => cols[0] && !['매장명', 'storename', 'name'].includes(cols[0].toLowerCase()))
    .map((cols) => ({
      storeName: cols[0] || '',
      region: cols[1] || '',
      category: cols[2] || '',
      contact: cols[3] || '',
      salesRep: cols[4] || '',
    }))
    .filter((r) => r.storeName);

  const run = async () => {
    if (!parsed.length) return;
    setBusy(true);
    for (let i = 0; i < parsed.length; i++) {
      await api('data?c=stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          item: {
            ...parsed[i],
            stage: '리드',
            monthlyFee: BURNING_MONTHLY_FEE,
            paymentStatus: '미결제',
            source: 'CSV',
            activities: [],
          },
        }),
      });
      setProg(i + 1);
    }
    setBusy(false);
    toast(`${parsed.length}건 리드 등록 완료`);
    onDone();
  };

  return (
    <Modal title="CSV 리드 대량등록" onClose={onClose}>
      <Text style={styles.muted}>
        한 줄에 매장 하나. 순서: 매장명, 지역, 카테고리, 연락처, 영업담당{'\n'}
        예) 감성포차, 서울, 포차, 010-1234-5678, 박영업
      </Text>
      <TextInput
        style={styles.csvArea}
        value={text}
        onChangeText={setText}
        multiline
        placeholder={'감성포차, 서울, 포차, 010-1234-5678, 박영업\n노가리집, 부산, 호프, 010-2222-3333, 김영업'}
        placeholderTextColor={colors.textTertiary}
        textAlignVertical="top"
      />
      <View style={styles.pbRow}>
        <Text style={styles.pbLabel}>인식된 리드</Text>
        <Text style={styles.pbVal}>{parsed.length}건</Text>
      </View>
      <TouchableOpacity
        style={[styles.saveBtn, (busy || !parsed.length) && { opacity: 0.5 }]}
        onPress={run}
        disabled={busy || !parsed.length}
      >
        <Text style={styles.saveBtnText}>
          {busy ? `등록 중… ${prog}/${parsed.length}` : `${parsed.length}건 리드로 등록`}
        </Text>
      </TouchableOpacity>
    </Modal>
  );
}

// 영업 분석 — 담당자 실적, 전환 퍼널, 매출 예측, 갱신·이탈 리스크.
function CrmAnalytics({ stores }: { stores: any[] }) {
  const today = todayStr();
  const thisMonth = today.slice(0, 7);
  const active = stores.filter((s) => s.stage === '활성');
  const pipeline = stores.filter((s) => OPEN_STAGES.includes(s.stage));
  const churned = stores.filter((s) => s.stage === '이탈');
  const activeMrr = active.length * BURNING_MONTHLY_FEE;

  // 전환 퍼널 — 각 단계에 '도달'한 누적 딜 수 (활성은 모든 이전 단계를 거침).
  const idxOf = (st: string) => STAGES.indexOf(st);
  const reached = STAGES.map(
    (_, i) => stores.filter((s) => s.stage !== '이탈' && idxOf(s.stage) >= i).length
  );
  const funnelTop = reached[0] || 1;

  // 담당자 리더보드.
  const repNames = Array.from(new Set(stores.map((s) => s.salesRep).filter(Boolean))) as string[];
  const reps = repNames
    .map((name) => {
      const own = stores.filter((s) => s.salesRep === name);
      const won = own.filter((s) => s.stage === '활성').length;
      const lost = own.filter((s) => s.stage === '이탈').length;
      const open = own.filter((s) => OPEN_STAGES.includes(s.stage)).length;
      const closable = won + lost;
      return {
        name,
        total: own.length,
        won,
        open,
        mrr: won * BURNING_MONTHLY_FEE,
        winRate: closable > 0 ? won / closable : 0,
      };
    })
    .sort((a, b) => b.mrr - a.mrr);

  // 매출 예측 — 파이프라인 단계별 성사확률 가중.
  const weighted = pipeline.reduce(
    (s, d) => s + (Number(d.monthlyFee) || BURNING_MONTHLY_FEE) * (STAGE_WIN_PROB[d.stage] || 0),
    0
  );
  const closingThisMonth = pipeline.filter(
    (d) => d.expectedCloseDate && String(d.expectedCloseDate).slice(0, 7) === thisMonth
  );
  const forecastNew = closingThisMonth.reduce(
    (s, d) => s + (Number(d.monthlyFee) || BURNING_MONTHLY_FEE) * (STAGE_WIN_PROB[d.stage] || 0),
    0
  );

  // 갱신·이탈 리스크.
  const overduePay = active.filter((s) => s.paymentStatus === '연체');
  const newThisMonth = active.filter(
    (s) => s.contractDate && String(s.contractDate).slice(0, 7) === thisMonth
  );

  return (
    <View>
      <View style={styles.kpiRow}>
        <Kpi icon="cash" label="확정 MRR" value={won(activeMrr)} />
        <Kpi icon="trending-up" label="가중 예상 매출" value={won(weighted)} accent />
        <Kpi icon="calendar" label="이달 성사예상" value={won(forecastNew)} />
        <Kpi icon="warning" label="결제 연체" value={`${overduePay.length}`} accent />
      </View>

      {/* 전환 퍼널 */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>전환 퍼널</Text>
        {STAGES.map((st, i) => {
          const c = reached[i];
          const pct = Math.round((c / funnelTop) * 100);
          const conv =
            i > 0 && reached[i - 1] > 0 ? Math.round((reached[i] / reached[i - 1]) * 100) : null;
          return (
            <View key={st} style={styles.funRow}>
              <View style={styles.funLabelWrap}>
                <View style={[styles.stageDot, { backgroundColor: STAGE_COLOR[st] }]} />
                <Text style={styles.funLabel}>{st}</Text>
              </View>
              <View style={styles.funTrack}>
                <View
                  style={[styles.funFill, { width: `${pct}%`, backgroundColor: STAGE_COLOR[st] }]}
                />
              </View>
              <Text style={styles.funCount}>{c}건</Text>
              <Text style={styles.funConv}>{conv != null ? `${conv}%` : '—'}</Text>
            </View>
          );
        })}
        <Text style={styles.muted}>
          우측 %는 직전 단계 대비 전환율 · 이탈 {churned.length}건 별도
        </Text>
      </View>

      {/* 담당자 리더보드 */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>영업 담당자 리더보드</Text>
        {reps.length === 0 ? (
          <Text style={styles.muted}>담당자 배정된 딜이 없어요.</Text>
        ) : (
          <View style={styles.table}>
            <View style={[styles.tr, styles.trHead]}>
              <Text style={[styles.th, { flex: 1.2 }]}>담당</Text>
              <Text style={[styles.th, { width: 56, textAlign: 'right' }]}>담당딜</Text>
              <Text style={[styles.th, { width: 48, textAlign: 'right' }]}>진행</Text>
              <Text style={[styles.th, { width: 48, textAlign: 'right' }]}>성사</Text>
              <Text style={[styles.th, { width: 56, textAlign: 'right' }]}>성사율</Text>
              <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>MRR 기여</Text>
            </View>
            {reps.map((r, i) => (
              <View key={r.name} style={styles.tr}>
                <Text style={[styles.td, styles.tdStrong, { flex: 1.2 }]} numberOfLines={1}>
                  {i === 0 ? '🏆 ' : ''}
                  {r.name}
                </Text>
                <Text style={[styles.td, { width: 56, textAlign: 'right' }]}>{r.total}</Text>
                <Text style={[styles.td, { width: 48, textAlign: 'right' }]}>{r.open}</Text>
                <Text style={[styles.td, { width: 48, textAlign: 'right' }]}>{r.won}</Text>
                <Text style={[styles.td, { width: 56, textAlign: 'right' }]}>
                  {Math.round(r.winRate * 100)}%
                </Text>
                <Text style={[styles.td, styles.tdStrong, { flex: 1, textAlign: 'right' }]}>
                  {won(r.mrr)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* 갱신·리스크 */}
      <View style={styles.dashRow}>
        <View style={styles.dashCardSm}>
          <Text style={styles.cardTitle}>이달 신규 계약</Text>
          <Text style={styles.gaugePct}>{newThisMonth.length}곳</Text>
          <Text style={styles.muted}>+{won(newThisMonth.length * BURNING_MONTHLY_FEE)} 신규 MRR</Text>
        </View>
        <View style={styles.dashCardLg}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>결제 리스크 · 연체 {overduePay.length}건</Text>
          </View>
          {overduePay.length === 0 ? (
            <Text style={styles.muted}>연체 매장이 없어요. 👍</Text>
          ) : (
            overduePay.map((s) => (
              <View key={s.id} style={styles.recentRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recentName} numberOfLines={1}>{s.storeName}</Text>
                  <Text style={styles.recentMeta} numberOfLines={1}>
                    {s.salesRep || '미배정'} · {s.region}
                  </Text>
                </View>
                <Badge value="연체" />
              </View>
            ))
          )}
        </View>
      </View>

      {/* 이달 성사 예상 리스트 */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>이달 성사 예상 ({closingThisMonth.length})</Text>
        {closingThisMonth.length === 0 ? (
          <Text style={styles.muted}>이달 예상 성사일(예상 성사일 입력)로 잡힌 딜이 없어요.</Text>
        ) : (
          closingThisMonth.map((s) => (
            <View key={s.id} style={styles.recentRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.recentName} numberOfLines={1}>{s.storeName}</Text>
                <Text style={styles.recentMeta} numberOfLines={1}>
                  {s.stage} · 확률 {Math.round((STAGE_WIN_PROB[s.stage] || 0) * 100)}% · {s.expectedCloseDate}
                </Text>
              </View>
              <Text style={styles.dealRep}>
                {won((Number(s.monthlyFee) || BURNING_MONTHLY_FEE) * (STAGE_WIN_PROB[s.stage] || 0))}
              </Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

// 사진 관리(추가·삭제·순서·대표) — 신규 폼/코크핏 공용.
function PhotoManager({
  photos,
  image,
  onChange,
}: {
  photos: string[];
  image: string;
  onChange: (photos: string[], image: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const list = photos && photos.length ? photos : image ? [image] : [];
  const setCover = (ph: string) => onChange(list, ph);
  const removePhoto = (ph: string) => {
    const next = list.filter((p) => p !== ph);
    onChange(next, image === ph ? next[0] || '' : image);
  };
  const move = (i: number, dir: number) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next, image || next[0]);
  };
  const dedup = () => {
    const seen = new Set<string>();
    const next = list.filter((p) => (seen.has(p) ? false : (seen.add(p), true)));
    if (next.length !== list.length) {
      onChange(next, next.includes(image) ? image : next[0] || '');
      toast(`중복 ${list.length - next.length}장 제거`);
    } else {
      toast('중복 사진 없음');
    }
  };
  const addPhotos = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        alert('사진 접근 권한이 필요합니다.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.6,
        base64: true,
        allowsMultipleSelection: true,
        selectionLimit: 10,
      });
      if (res.canceled) return;
      setUploading(true);
      const urls: string[] = [];
      for (const a of res.assets as any[]) {
        const mime = a.mimeType || 'image/jpeg';
        const dataUrl = a.base64 ? `data:${mime};base64,${a.base64}` : a.uri;
        const r = await api('upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl }),
        });
        const d = await r.json();
        if (d.url) urls.push(d.url);
      }
      if (urls.length) {
        const next = [...list, ...urls];
        onChange(next, image || next[0]);
        toast(`사진 ${urls.length}장 추가됨`);
      } else {
        alert('업로드 실패 — 저장소 연결을 확인해 주세요.');
      }
    } catch {
      alert('이미지 업로드 오류');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View>
      <View style={styles.photoHeadRow}>
        <Text style={styles.muted}>
          {list.length ? `${list.length}장 · 탭=대표, ◀▶=순서, ×=삭제` : '사진을 추가하거나 네이버로 불러오세요'}
        </Text>
        {list.length > 1 ? (
          <TouchableOpacity onPress={dedup}>
            <Text style={styles.linkText}>중복 정리</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.photoGrid}>
        {list.map((ph, i) => {
          const isCover = image ? image === ph : i === 0;
          return (
            <View key={ph + i} style={styles.ckPhotoWrap}>
              <TouchableOpacity activeOpacity={0.85} onPress={() => setCover(ph)}>
                <Image
                  source={{ uri: ph }}
                  style={[styles.naverThumb, isCover && styles.naverThumbOn]}
                  resizeMode="cover"
                />
              </TouchableOpacity>
              {isCover ? (
                <View style={styles.coverTag}>
                  <Text style={styles.coverTagText}>대표</Text>
                </View>
              ) : null}
              <TouchableOpacity style={styles.photoDel} onPress={() => removePhoto(ph)} hitSlop={6}>
                <Ionicons name="close" size={13} color="#fff" />
              </TouchableOpacity>
              <View style={styles.photoMoveRow}>
                <TouchableOpacity
                  style={[styles.photoMove, i === 0 && { opacity: 0.35 }]}
                  onPress={() => move(i, -1)}
                  disabled={i === 0}
                >
                  <Ionicons name="chevron-back" size={13} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.photoMove, i === list.length - 1 && { opacity: 0.35 }]}
                  onPress={() => move(i, 1)}
                  disabled={i === list.length - 1}
                >
                  <Ionicons name="chevron-forward" size={13} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
        <TouchableOpacity
          style={[styles.naverThumb, styles.photoAdd]}
          onPress={addPhotos}
          disabled={uploading}
          activeOpacity={0.8}
        >
          <Ionicons name={uploading ? 'cloud-upload-outline' : 'add'} size={22} color={colors.primary} />
          <Text style={styles.photoAddText}>{uploading ? '업로드…' : '추가'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// 메뉴·가격 편집 — 네이버에서 가져온 뒤 수정/추가/삭제.
function MenuEditor({
  menus,
  onChange,
}: {
  menus: { name: string; price: number }[];
  onChange: (menus: { name: string; price: number }[]) => void;
}) {
  const list = Array.isArray(menus) ? menus : [];
  const upd = (i: number, k: 'name' | 'price', v: string) =>
    onChange(list.map((m, idx) => (idx === i ? { ...m, [k]: k === 'price' ? Number(v) || 0 : v } : m)));
  const del = (i: number) => onChange(list.filter((_, idx) => idx !== i));
  const add = () => onChange([...list, { name: '', price: 0 }]);
  return (
    <View>
      {list.map((m, i) => (
        <View key={i} style={styles.menuRow}>
          <TextInput
            style={[styles.fInput, styles.menuName]}
            value={String(m.name || '')}
            onChangeText={(v) => upd(i, 'name', v)}
            placeholder="메뉴명"
            placeholderTextColor={colors.textTertiary}
          />
          <TextInput
            style={[styles.fInput, styles.menuPrice]}
            value={m.price ? String(m.price) : ''}
            onChangeText={(v) => upd(i, 'price', v)}
            placeholder="가격"
            keyboardType="numeric"
            placeholderTextColor={colors.textTertiary}
          />
          <TouchableOpacity onPress={() => del(i)} style={styles.menuDel} hitSlop={6}>
            <Ionicons name="close" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity style={styles.menuAdd} onPress={add}>
        <Ionicons name="add" size={16} color={colors.primary} />
        <Text style={styles.menuAddText}>메뉴 추가</Text>
      </TouchableOpacity>
    </View>
  );
}

function DealModal({
  deal,
  staffNames = [],
  onClose,
  onSave,
  onDelete,
}: {
  deal: any;
  staffNames?: string[];
  onClose: () => void;
  onSave: (i: any) => void;
  onDelete: (id: string) => void;
}) {
  const [f, setF] = useState<any>(() => ({
    stage: '리드',
    monthlyFee: BURNING_MONTHLY_FEE,
    paymentStatus: '미결제',
    source: '영업',
    activities: [],
    ...deal,
  }));
  const [note, setNote] = useState('');
  const [naverUrl, setNaverUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const addNote = () => {
    const t = note.trim();
    if (!t) return;
    set('activities', [
      { id: `act_${Math.random().toString(36).slice(2, 8)}`, date: todayStr(), note: t },
      ...(f.activities || []),
    ]);
    setNote('');
  };

  const importNaver = async () => {
    const url = naverUrl.trim();
    if (!url) return;
    setImporting(true);
    setImportMsg('');
    try {
      const r = await api('naver-place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const d = await r.json();
      const gotSomething = d.name || (d.photos && d.photos.length) || d.lat;
      if (!gotSomething) {
        setImportMsg('불러오기 실패 — URL을 확인하거나 아래에 직접 입력해 주세요.');
      } else {
        setF((p: any) => ({
          ...p,
          storeName: d.name || p.storeName,
          category: d.category || p.category,
          region: d.region || p.region,
          address: d.roadAddress || d.address || p.address,
          contact: d.phone || p.contact,
          lat: d.lat || p.lat,
          lng: d.lng || p.lng,
          photos: d.photos && d.photos.length ? d.photos : p.photos,
          image: (d.photos && d.photos[0]) || p.image,
          menus: d.menus && d.menus.length ? d.menus : p.menus,
          naverPlaceId: d.placeId || p.naverPlaceId,
          naverUrl: d.sourceUrl || url,
        }));
        const bits: string[] = [];
        if (d.name) bits.push('상호·주소');
        if (d.photos?.length) bits.push(`사진 ${d.photos.length}장`);
        if (d.menus?.length) bits.push(`메뉴 ${d.menus.length}개`);
        if (d.lat) bits.push('좌표');
        setImportMsg(`✓ ${bits.join(' · ') || '일부 정보'} 불러옴`);
      }
    } catch {
      setImportMsg('불러오기 실패 — 잠시 후 다시 시도해 주세요.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal onClose={onClose} title={f.id ? f.storeName : '새 매장 (리드)'} size="wide">
      <View style={styles.naverCard}>
        <Text style={styles.naverTitle}>🟢 네이버 플레이스로 자동 등록</Text>
        <Text style={styles.muted}>플레이스 URL을 붙여넣으면 상호·주소·좌표·사진을 자동으로 채워요.</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
          <TextInput
            style={[styles.fInput, { flex: 1, marginBottom: 0 }]}
            value={naverUrl}
            onChangeText={setNaverUrl}
            placeholder="https://naver.me/... 또는 map.naver.com/..."
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            onSubmitEditing={importNaver}
          />
          <TouchableOpacity
            style={[styles.naverBtn, importing && { opacity: 0.6 }]}
            onPress={importNaver}
            disabled={importing}
          >
            <Text style={styles.naverBtnText}>{importing ? '불러오는 중…' : '불러오기'}</Text>
          </TouchableOpacity>
        </View>
        {importMsg ? (
          <Text
            style={[
              styles.muted,
              { marginTop: 6, color: importMsg.startsWith('✓') ? colors.primary : colors.coral, fontWeight: '700' },
            ]}
          >
            {importMsg}
          </Text>
        ) : null}
        {f.lat && f.lng ? (
          <View style={styles.coordChip}>
            <Ionicons name="location" size={13} color={colors.primary} />
            <Text style={styles.coordText}>
              좌표 {Number(f.lat).toFixed(5)}, {Number(f.lng).toFixed(5)} · 활성 시 지도 노출 준비됨
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.fLabel}>사진</Text>
      <PhotoManager
        photos={Array.isArray(f.photos) ? f.photos : []}
        image={f.image || ''}
        onChange={(ph, img) => setF((p: any) => ({ ...p, photos: ph, image: img }))}
      />

      <Text style={styles.fLabel}>메뉴 · 가격</Text>
      <MenuEditor menus={Array.isArray(f.menus) ? f.menus : []} onChange={(mm) => set('menus', mm)} />

      <Text style={styles.fLabel}>영업 단계</Text>
      <View style={styles.chipRow}>
        {[...STAGES, '이탈'].map((st) => (
          <TouchableOpacity
            key={st}
            style={[styles.stageChip, f.stage === st && { backgroundColor: STAGE_COLOR[st], borderColor: STAGE_COLOR[st] }]}
            onPress={() => set('stage', st)}
          >
            <Text style={[styles.stageChipText, f.stage === st && { color: '#fff' }]}>{st}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FormField label="매장명 *" value={String(f.storeName ?? '')} onChange={(v) => set('storeName', v)} />
      <View style={styles.formRow}>
        <View style={{ flex: 1 }}>
          <FormField label="지역" value={String(f.region ?? '')} onChange={(v) => set('region', v)} />
        </View>
        <View style={{ flex: 1 }}>
          <FormField label="카테고리" value={String(f.category ?? '')} onChange={(v) => set('category', v)} />
        </View>
      </View>
      <FormField label="주소" value={String(f.address ?? '')} onChange={(v) => set('address', v)} />
      <View style={styles.formRow}>
        <View style={{ flex: 1 }}>
          <FormField label="매장 담당자" value={String(f.ownerName ?? '')} onChange={(v) => set('ownerName', v)} />
        </View>
        <View style={{ flex: 1 }}>
          <FormField label="연락처 *" value={String(f.contact ?? '')} onChange={(v) => set('contact', v)} />
        </View>
      </View>
      <Dropdown
        label="매장 담당 직원 (직원 관리에서 등록)"
        value={f.salesRep || ''}
        options={Array.from(new Set(['(미배정)', ...staffNames, ...(f.salesRep ? [f.salesRep] : [])]))}
        onChange={(v) => set('salesRep', v === '(미배정)' ? '' : v)}
        placeholder={staffNames.length ? '담당 직원 선택' : '직원 관리에서 먼저 추가'}
        searchable
      />
      <FormField label="월 구독료" value={String(f.monthlyFee ?? '')} onChange={(v) => set('monthlyFee', v)} numeric />
      <View style={styles.formRow}>
        <View style={{ flex: 1 }}>
          <FormField label="예상 성사일" value={String(f.expectedCloseDate ?? '')} onChange={(v) => set('expectedCloseDate', v)} placeholder="2026-05-01" />
        </View>
        <View style={{ flex: 1 }}>
          <SelectRow label="결제" value={String(f.paymentStatus ?? '미결제')} options={['미결제', '결제완료', '연체']} onChange={(v) => set('paymentStatus', v)} />
        </View>
      </View>

      <View style={styles.formRow}>
        <View style={{ flex: 2 }}>
          <FormField label="다음 할일" value={String(f.nextAction ?? '')} onChange={(v) => set('nextAction', v)} placeholder="예: 방문 미팅" />
        </View>
        <View style={{ flex: 1 }}>
          <FormField label="날짜" value={String(f.nextActionDate ?? '')} onChange={(v) => set('nextActionDate', v)} placeholder="2026-05-01" />
        </View>
      </View>

      <Text style={styles.fLabel}>온보딩 체크리스트</Text>
      <View style={styles.card}>
        {[
          { ok: !!f.salesRep, label: '영업 담당 배정' },
          { ok: !!f.contact, label: '연락처 확보' },
          { ok: ['계약', '활성'].includes(f.stage), label: '계약 성사' },
          { ok: f.paymentStatus === '결제완료', label: '첫 결제 완료' },
          { ok: f.stage === '활성' && !!f.lat && !!f.lng, label: '버닝맵 노출 (좌표 등록)' },
        ].map((s) => (
          <View key={s.label} style={styles.checkRow}>
            <Ionicons
              name={s.ok ? 'checkmark-circle' : 'ellipse-outline'}
              size={18}
              color={s.ok ? colors.primary : colors.textTertiary}
            />
            <Text style={[styles.checkLabel, s.ok && { color: colors.textPrimary, fontWeight: '700' }]}>
              {s.label}
            </Text>
          </View>
        ))}
      </View>

      <Text style={styles.fLabel}>활동 로그</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
        <TextInput
          style={[styles.fInput, { flex: 1 }]}
          value={note}
          onChangeText={setNote}
          onSubmitEditing={addNote}
          placeholder="통화·방문·메모 기록…"
          placeholderTextColor={colors.textTertiary}
        />
        <TouchableOpacity style={styles.noteAdd} onPress={addNote}>
          <Ionicons name="add" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>
      {(f.activities || []).map((a: any) => (
        <View key={a.id} style={styles.actRow}>
          <Text style={styles.actDate}>{a.date}</Text>
          <Text style={styles.actNote}>{a.note}</Text>
        </View>
      ))}

      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
        {f.id ? (
          <TouchableOpacity style={styles.delDealBtn} onPress={() => onDelete(f.id)}>
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={[styles.saveBtn, { flex: 1 }]} onPress={() => onSave(f)}>
          <Text style={styles.saveBtnText}>저장</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// 딜 상세 코크핏 — 기존 매장 '수정' 시 뜨는 계정 관리 중심 화면.
function DealCockpit({
  deal,
  onClose,
  onEdit,
  onDelete,
  onPersist,
}: {
  deal: any;
  onClose: () => void;
  onEdit: () => void;
  onDelete: (id: string) => void;
  onPersist: (item: any) => void;
}) {
  useScrollLock();
  const [f, setF] = useState<any>(deal);
  const [note, setNote] = useState('');
  const today = todayStr();
  const patch = (changes: any) => {
    const nf = { ...f, ...changes };
    setF(nf);
    onPersist(nf);
  };
  const addNote = () => {
    const t = note.trim();
    if (!t) return;
    patch({
      activities: [
        { id: `act_${Math.random().toString(36).slice(2, 8)}`, date: today, note: t },
        ...(f.activities || []),
      ],
    });
    setNote('');
  };

  const isActive = f.stage === '활성';
  const fee = Number(f.monthlyFee) || BURNING_MONTHLY_FEE;
  const [creatingAcct, setCreatingAcct] = useState(false);
  const createCorpAccount = async () => {
    if (creatingAcct) return;
    setCreatingAcct(true);
    try {
      const loginId = genLoginId(f.storeName);
      const password = genPassword();
      const item = {
        memberType: '기업',
        companyName: f.storeName || '',
        name: f.storeName || '',
        managerName: f.ownerName || '',
        managerContact: f.contact || '',
        industry: f.category || '',
        bizNo: '',
        linkedStoreId: f.id,
        linkedStoreName: f.storeName || '',
        loginId,
        password,
        status: 'active',
        role: 'store',
        pb: 0,
        joinedAt: today,
      };
      const r = await api('data?c=members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', item }),
      });
      const d = await r.json();
      const memberId = d.items?.[0]?.id || '';
      patch({ accountMemberId: memberId, accountLoginId: loginId, accountPassword: password });
      toast(`기업 계정 발급: @${loginId} / 비번 ${password}`);
    } catch {
      alert('계정 생성 오류');
    } finally {
      setCreatingAcct(false);
    }
  };
  const steps = [
    !!f.salesRep,
    !!f.contact,
    ['계약', '활성'].includes(f.stage),
    f.paymentStatus === '결제완료',
    isActive && !!f.lat && !!f.lng,
  ];
  const doneN = steps.filter(Boolean).length;
  const dday = f.nextActionDate
    ? Math.ceil((new Date(f.nextActionDate).getTime() - new Date(today).getTime()) / 86400000)
    : null;

  const call = () => {
    if (f.contact && typeof window !== 'undefined') window.open(`tel:${f.contact}`);
  };
  const openNaver = () => {
    if (typeof window === 'undefined') return;
    const u =
      f.naverUrl ||
      (f.naverPlaceId
        ? `https://m.place.naver.com/place/${f.naverPlaceId}/home`
        : f.storeName
          ? `https://map.naver.com/p/search/${encodeURIComponent(f.storeName)}`
          : '');
    if (u) window.open(u, '_blank');
  };
  const openMap = () => {
    if (typeof window === 'undefined') return;
    if (f.lat && f.lng) window.open(`https://map.naver.com/p/?c=${f.lng},${f.lat},17,0,0,0,dh`, '_blank');
    else openNaver();
  };

  return (
    <Portal>
    <View style={styles.drawerOverlay}>
      <TouchableOpacity style={styles.drawerBackdrop} activeOpacity={1} onPress={onClose} />
      <View style={styles.drawerPanel}>
        <View style={styles.drawerHead}>
          <Text style={styles.drawerTitle} numberOfLines={1}>{f.storeName || '매장'}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.drawerBody}
          showsVerticalScrollIndicator={false}
        >
      <View style={styles.ckHead}>
        <Badge value={f.stage} />
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.ckEditBtn} onPress={onEdit}>
          <Ionicons name="create-outline" size={15} color={colors.primary} />
          <Text style={styles.ckEditText}>정보 수정</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.fLabel}>사진</Text>
      <PhotoManager
        photos={Array.isArray(f.photos) ? f.photos : []}
        image={f.image || ''}
        onChange={(ph, img) => patch({ photos: ph, image: img })}
      />

      <View style={styles.ckStatRow}>
        <View style={styles.ckStat}>
          <Text style={styles.ckStatV}>
            {won(isActive ? fee : Math.round(fee * (STAGE_WIN_PROB[f.stage] || 0)))}
          </Text>
          <Text style={styles.ckStatL}>{isActive ? '월 MRR' : '기대 매출'}</Text>
        </View>
        <View style={styles.ckStat}>
          <Text style={styles.ckStatV}>{f.paymentStatus || '미결제'}</Text>
          <Text style={styles.ckStatL}>결제</Text>
        </View>
        <View style={styles.ckStat}>
          <Text style={styles.ckStatV}>{doneN}/5</Text>
          <Text style={styles.ckStatL}>온보딩</Text>
        </View>
      </View>

      <Text style={styles.fLabel}>영업 단계 · 탭하여 이동</Text>
      <View style={styles.chipRow}>
        {[...STAGES, '이탈'].map((st) => (
          <TouchableOpacity
            key={st}
            style={[styles.stageChip, f.stage === st && { backgroundColor: STAGE_COLOR[st], borderColor: STAGE_COLOR[st] }]}
            onPress={() =>
              patch({ stage: st, ...(st === '활성' && !f.contractDate ? { contractDate: today } : {}) })
            }
          >
            <Text style={[styles.stageChipText, f.stage === st && { color: '#fff' }]}>{st}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isActive ? (
        <>
          <Text style={styles.fLabel}>결제 상태 · 탭하여 변경</Text>
          <View style={styles.chipRow}>
            {['미결제', '결제완료', '연체'].map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.stageChip, f.paymentStatus === p && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={() => patch({ paymentStatus: p })}
              >
                <Text style={[styles.stageChipText, f.paymentStatus === p && { color: '#fff' }]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : null}

      {f.nextAction || f.nextActionDate ? (
        <View style={[styles.card, dday != null && dday < 0 ? { borderColor: colors.coral, borderWidth: 1 } : null]}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>다음 할일</Text>
            {dday != null ? (
              <Text style={[styles.ckDday, dday < 0 && { color: colors.coral }]}>
                {dday < 0 ? `${-dday}일 지남` : dday === 0 ? '오늘' : `D-${dday}`}
              </Text>
            ) : null}
          </View>
          <Text style={styles.ckNext}>
            {f.nextAction || '-'}
            {f.nextActionDate ? `  ·  ${f.nextActionDate}` : ''}
          </Text>
        </View>
      ) : null}

      <Text style={styles.fLabel}>활동 타임라인</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
        <TextInput
          style={[styles.fInput, { flex: 1, marginBottom: 0 }]}
          value={note}
          onChangeText={setNote}
          onSubmitEditing={addNote}
          placeholder="통화·방문·메모 기록…"
          placeholderTextColor={colors.textTertiary}
        />
        <TouchableOpacity style={styles.noteAdd} onPress={addNote}>
          <Ionicons name="add" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>
      {(f.activities || []).length === 0 ? (
        <Text style={styles.muted}>기록이 없어요. 첫 활동을 남겨보세요.</Text>
      ) : (
        (f.activities || []).map((a: any) => (
          <View key={a.id} style={styles.actRow}>
            <Text style={styles.actDate}>{a.date}</Text>
            <Text style={styles.actNote}>{a.note}</Text>
          </View>
        ))
      )}

      <Text style={styles.fLabel}>매장 정보</Text>
      <View style={styles.card}>
        <View style={styles.ckInfoRow}>
          <Ionicons name="location-outline" size={15} color={colors.textTertiary} />
          <Text style={styles.ckInfoText}>{[f.address, f.region].filter(Boolean).join(' · ') || '주소 미입력'}</Text>
        </View>
        <View style={styles.ckInfoRow}>
          <Ionicons name="call-outline" size={15} color={colors.textTertiary} />
          <Text style={styles.ckInfoText}>{f.contact || '연락처 미입력'}</Text>
        </View>
        <View style={styles.ckInfoRow}>
          <Ionicons name="person-outline" size={15} color={colors.textTertiary} />
          <Text style={styles.ckInfoText}>영업 담당 {f.salesRep || '미배정'}</Text>
        </View>
        <View style={styles.ckInfoRow}>
          <Ionicons name="navigate-outline" size={15} color={colors.textTertiary} />
          <Text style={styles.ckInfoText}>
            {f.lat && f.lng
              ? `${Number(f.lat).toFixed(5)}, ${Number(f.lng).toFixed(5)} · 지도 노출 ${isActive ? '중' : '대기'}`
              : '좌표 없음 (네이버 불러오기 권장)'}
          </Text>
        </View>
      </View>

      <Text style={styles.fLabel}>기업 계정 (매장주)</Text>
      {f.accountMemberId || f.accountLoginId ? (
        <View style={styles.acctCard}>
          <Ionicons name="business" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.acctId}>@{f.accountLoginId || '발급됨'}</Text>
            <Text style={styles.muted}>
              {f.accountPassword ? `비밀번호 ${f.accountPassword} · ` : ''}회원 관리에서 상세 편집
            </Text>
          </View>
          <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
        </View>
      ) : isActive ? (
        <TouchableOpacity
          style={[styles.acctBtn, creatingAcct && { opacity: 0.6 }]}
          onPress={createCorpAccount}
          disabled={creatingAcct}
        >
          <Ionicons name="business-outline" size={16} color={colors.white} />
          <Text style={styles.acctBtnText}>{creatingAcct ? '발급 중…' : '🏢 기업 계정 발급'}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.muted}>활성 매장이 되면 기업 계정을 발급할 수 있어요.</Text>
      )}

      <Text style={styles.fLabel}>메뉴 · 가격</Text>
      <MenuEditor menus={Array.isArray(f.menus) ? f.menus : []} onChange={(mm) => patch({ menus: mm })} />

      <View style={styles.ckActions}>
        <TouchableOpacity style={styles.ckAct} onPress={call}>
          <Ionicons name="call" size={16} color={colors.primary} />
          <Text style={styles.ckActText}>전화</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ckAct} onPress={() => printInvoice(f)}>
          <Ionicons name="print" size={16} color={colors.primary} />
          <Text style={styles.ckActText}>인보이스</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ckAct} onPress={openMap}>
          <Ionicons name="map" size={16} color={colors.primary} />
          <Text style={styles.ckActText}>지도</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ckAct} onPress={openNaver}>
          <Ionicons name="globe-outline" size={16} color={'#03C75A'} />
          <Text style={[styles.ckActText, { color: '#03C75A' }]}>네이버</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.ckDelete} onPress={() => onDelete(f.id)}>
        <Ionicons name="trash-outline" size={15} color={colors.danger} />
        <Text style={styles.ckDeleteText}>이 딜 삭제</Text>
      </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
    </Portal>
  );
}

/* ========================================================= finance/ledger */

function PLRow({
  label,
  value,
  sub,
  total,
  accent,
}: {
  label: string;
  value: number;
  sub?: string;
  total?: boolean;
  accent?: boolean;
}) {
  return (
    <View style={[styles.plRow, total && styles.plRowTotal]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.plLabel, total && { color: colors.textPrimary, fontWeight: '900' }]}>
          {label}
        </Text>
        {sub ? <Text style={styles.plSub}>{sub}</Text> : null}
      </View>
      <Text
        style={[
          styles.plValue,
          total && { fontWeight: '900', fontSize: 18 },
          value < 0 && { color: colors.coral },
          accent && { color: colors.danger },
        ]}
      >
        {value < 0 ? '−' : ''}{won(Math.abs(value))}
      </Text>
    </View>
  );
}

function FinanceView() {
  const [ledger, setLedger] = useState<any[]>([]);
  const [apps, setApps] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [f, setF] = useState({ type: 'income', category: '', amount: '', memo: '', date: '' });

  const refresh = async () => {
    const [l, a, c, p, sh, st] = await Promise.all([
      api('data?c=ledger').then((r) => r.json()).catch(() => ({})),
      api('data?c=stores').then((r) => r.json()).catch(() => ({})),
      api('data?c=campaigns').then((r) => r.json()).catch(() => ({})),
      api('data?c=products').then((r) => r.json()).catch(() => ({})),
      api('data?c=shipments').then((r) => r.json()).catch(() => ({})),
      api('data?c=staff').then((r) => r.json()).catch(() => ({})),
    ]);
    setLedger(l.items || []);
    setApps(a.items || []);
    setCampaigns(c.items || []);
    setProducts(p.items || []);
    setShipments(sh.items || []);
    setStaff(st.items || []);
  };
  useEffect(() => {
    refresh();
  }, []);

  const activeStores = apps.filter((a) => a.stage === '활성').length;
  const subscriptionRev = activeStores * BURNING_MONTHLY_FEE;
  const campaignRev = campaigns
    .filter((c) => c.status !== '종료')
    .reduce((s, c) => s + (Number(c.stores) || 0) * (Number(c.feePerStore) || 0), 0);
  const manualIncome = ledger.filter((e) => e.type === 'income').reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalIncome = subscriptionRev + campaignRev + manualIncome;
  const prizeBudget = Math.round(subscriptionRev * PRIZE_BUDGET_RATE);
  const opsExpense = ledger.filter((e) => e.type === 'expense').reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const payroll = staff
    .filter((s) => s.status !== '퇴사')
    .reduce((s, m) => s + (Number(m.salary) || 0), 0);
  const totalCost = prizeBudget + opsExpense + payroll;
  const net = totalIncome - totalCost;
  const expense = opsExpense;

  // 청구·정산
  const activeList = apps.filter((a) => a.stage === '활성');
  const feeOf = (a: any) => Number(a.monthlyFee) || BURNING_MONTHLY_FEE;
  const billed = activeList.reduce((s, a) => s + feeOf(a), 0);
  const collected = activeList.filter((a) => a.paymentStatus === '결제완료').reduce((s, a) => s + feeOf(a), 0);
  const overdueAmt = activeList.filter((a) => a.paymentStatus === '연체').reduce((s, a) => s + feeOf(a), 0);
  const receivable = billed - collected;
  const paidN = activeList.filter((a) => a.paymentStatus === '결제완료').length;
  const overdueN = activeList.filter((a) => a.paymentStatus === '연체').length;
  const unpaidN = activeList.length - paidN - overdueN;

  // 경품 풀 회계 — 모금(구독 매출) → 예산(50%) → 실지출(수여된 경품 시가).
  const priceByName: Record<string, number> = {};
  products.forEach((p) => (priceByName[p.name] = Number(p.price) || 0));
  const prizeOut = shipments.reduce((s, sh) => s + (priceByName[sh.product] || 0), 0);
  const prizeAwardedN = shipments.length;
  const poolRemaining = prizeBudget - prizeOut;
  const poolUse = prizeBudget > 0 ? Math.min(1, prizeOut / prizeBudget) : 0;
  const registeredValue = products
    .filter((p) => p.status !== 'ended')
    .reduce((s, p) => s + (Number(p.price) || 0), 0);

  const add = async () => {
    if (!f.amount || !f.category) return;
    await api('data?c=ledger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        item: { type: f.type, category: f.category, amount: Number(f.amount) || 0, memo: f.memo, date: f.date },
      }),
    });
    setModal(false);
    setF({ type: 'income', category: '', amount: '', memo: '', date: '' });
    toast('내역이 추가되었습니다');
    refresh();
  };
  const del = async (id: string) => {
    if (!confirmAction('이 내역을 삭제할까요?')) return;
    await api('data?c=ledger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    });
    toast('삭제되었습니다');
    refresh();
  };

  return (
    <View>
      <View style={styles.h1Row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>매출 · 지출 (P&L)</Text>
          <Text style={styles.sectionSub}>구독·캠페인 매출 − 경품(50%) − 인건비 − 운영비 = 순이익</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModal(true)}>
          <Ionicons name="add" size={18} color={colors.white} />
          <Text style={styles.addBtnText}>내역 추가</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.kpiRow}>
        <Kpi icon="cash" label="총 매출" value={won(totalIncome)} />
        <Kpi icon="gift" label="경품 투입 (50%)" value={won(prizeBudget)} accent />
        <Kpi icon="people" label="인건비 (급여)" value={won(payroll)} />
        <Kpi icon="trending-up" label="순이익" value={won(net)} />
      </View>

      <Text style={styles.h2}>손익 계산서</Text>
      <View style={styles.card}>
        <PLRow label="버닝 매장 구독" value={subscriptionRev} sub={`활성 ${activeStores}곳 × ${won(BURNING_MONTHLY_FEE)}`} />
        <PLRow label="슈퍼버닝 캠페인" value={campaignRev} />
        <PLRow label="기타 매출" value={manualIncome} />
        <PLRow label="총 매출" value={totalIncome} total />
        <PLRow label="경품 투입 (매출의 50%)" value={-prizeBudget} />
        <PLRow label="인건비 (재직 직원 급여)" value={-payroll} />
        <PLRow label="운영비 (수동)" value={-opsExpense} />
        <PLRow label="순이익" value={net} total accent={net < 0} />
      </View>

      <Text style={styles.h2}>경품 풀 회계 (50% 룰)</Text>
      <View style={styles.dashRow}>
        <View style={styles.dashCardLg}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>경품 예산 소진</Text>
            <Text style={styles.cardBig}>{Math.round(poolUse * 100)}%</Text>
          </View>
          <View style={styles.gaugeTrack}>
            <View
              style={[
                styles.gaugeFill,
                { width: `${poolUse * 100}%`, backgroundColor: poolUse >= 1 ? colors.coral : colors.primary },
              ]}
            />
          </View>
          <PLRow label="모금액 (구독 매출)" value={subscriptionRev} />
          <PLRow label="경품 예산 (50%)" value={prizeBudget} total />
          <PLRow label={`경품 수여 지출 · ${prizeAwardedN}건`} value={-prizeOut} />
          <PLRow
            label={poolRemaining >= 0 ? '잔여 예산' : '예산 초과'}
            value={poolRemaining}
            total
            accent={poolRemaining < 0}
          />
        </View>
        <View style={styles.dashCardSm}>
          <Text style={styles.cardTitle}>등록 경품 시가</Text>
          <Text style={styles.gaugePct}>{won(registeredValue)}</Text>
          <Text style={styles.muted}>
            노출 중 경품 {products.filter((p) => p.status !== 'ended').length}종{'\n'}
            수여 완료 {prizeAwardedN}건 · {won(prizeOut)}
          </Text>
        </View>
      </View>

      {campaigns.filter((c) => c.status !== '종료').length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>슈퍼버닝 캠페인 회계</Text>
          <View style={styles.table}>
            <View style={[styles.tr, styles.trHead]}>
              <Text style={[styles.th, { flex: 1.6 }]}>캠페인</Text>
              <Text style={[styles.th, { flex: 1 }]}>경품</Text>
              <Text style={[styles.th, { width: 56, textAlign: 'right' }]}>매장</Text>
              <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>모금액</Text>
            </View>
            {campaigns
              .filter((c) => c.status !== '종료')
              .map((c) => (
                <View key={c.id} style={styles.tr}>
                  <Text style={[styles.td, styles.tdStrong, { flex: 1.6 }]} numberOfLines={1}>{c.name}</Text>
                  <Text style={[styles.td, { flex: 1 }]} numberOfLines={1}>{c.prize || '-'}</Text>
                  <Text style={[styles.td, { width: 56, textAlign: 'right' }]}>{c.stores || 0}</Text>
                  <Text style={[styles.td, styles.tdStrong, { flex: 1, textAlign: 'right' }]}>
                    {won((Number(c.stores) || 0) * (Number(c.feePerStore) || 0))}
                  </Text>
                </View>
              ))}
          </View>
        </View>
      ) : null}

      <Text style={styles.h2}>이번 달 청구 · 정산</Text>
      <View style={styles.kpiRow}>
        <Kpi icon="receipt" label="청구 총액" value={won(billed)} />
        <Kpi icon="checkmark-circle" label="수금 완료" value={won(collected)} />
        <Kpi icon="alert-circle" label="미수금" value={won(receivable)} accent />
      </View>
      <View style={styles.card}>
        <PLRow label={`결제완료 · ${paidN}곳`} value={collected} />
        <PLRow label={`미결제 · ${unpaidN}곳`} value={receivable - overdueAmt} />
        <PLRow label={`연체 · ${overdueN}곳`} value={overdueAmt} accent={overdueN > 0} />
      </View>

      {activeList.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>매장별 청구 · 인보이스</Text>
          <View style={styles.table}>
            <View style={[styles.tr, styles.trHead]}>
              <Text style={[styles.th, { flex: 1.6 }]}>매장</Text>
              <Text style={[styles.th, { flex: 1 }]}>결제</Text>
              <Text style={[styles.th, { width: 100, textAlign: 'right' }]}>월 구독료</Text>
              <Text style={[styles.th, { width: 84, textAlign: 'right' }]}>인보이스</Text>
            </View>
            {activeList.map((s) => (
              <View key={s.id} style={styles.tr}>
                <Text style={[styles.td, styles.tdStrong, { flex: 1.6 }]} numberOfLines={1}>
                  {s.storeName}
                </Text>
                <View style={{ flex: 1 }}>
                  <Badge value={s.paymentStatus || '미결제'} />
                </View>
                <Text style={[styles.td, { width: 100, textAlign: 'right' }]}>{won(feeOf(s))}</Text>
                <View style={{ width: 84, alignItems: 'flex-end' }}>
                  <TouchableOpacity style={styles.invBtn} onPress={() => printInvoice(s)}>
                    <Ionicons name="print-outline" size={14} color={colors.primary} />
                    <Text style={styles.invBtnText}>발행</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <Text style={styles.h2}>수동 내역</Text>
      {ledger.length === 0 ? (
        <Empty text="등록된 내역이 없어요." />
      ) : (
        <View style={styles.table}>
          <View style={[styles.tr, styles.trHead]}>
            <Text style={[styles.th, { flex: 1 }]}>구분</Text>
            <Text style={[styles.th, { flex: 2 }]}>항목</Text>
            <Text style={[styles.th, { flex: 2 }]}>메모</Text>
            <Text style={[styles.th, { flex: 1.5, textAlign: 'right' }]}>금액</Text>
            <Text style={[styles.th, { width: 44 }]}> </Text>
          </View>
          {ledger.map((e) => (
            <View key={e.id} style={styles.tr}>
              <Text style={[styles.td, { flex: 1, color: e.type === 'income' ? colors.primary : colors.coral, fontWeight: '800' }]}>
                {e.type === 'income' ? '매출' : '지출'}
              </Text>
              <Text style={[styles.td, styles.tdStrong, { flex: 2 }]}>{e.category}</Text>
              <Text style={[styles.td, { flex: 2 }]}>{e.memo || '-'}</Text>
              <Text style={[styles.td, { flex: 1.5, textAlign: 'right' }]}>{won(Number(e.amount) || 0)}</Text>
              <TouchableOpacity style={{ width: 44, alignItems: 'flex-end' }} onPress={() => del(e.id)}>
                <Ionicons name="trash-outline" size={17} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {modal && (
        <Modal onClose={() => setModal(false)} title="내역 추가">
          <SelectRow
            label="구분"
            value={f.type}
            options={['income', 'expense']}
            display={(v) => (v === 'income' ? '매출' : '지출')}
            onChange={(v) => setF((p) => ({ ...p, type: v }))}
          />
          <FormField label="항목" value={f.category} onChange={(v) => setF((p) => ({ ...p, category: v }))} placeholder="예: 광고 수익 / 서버비" />
          <FormField label="금액(원)" value={f.amount} onChange={(v) => setF((p) => ({ ...p, amount: v }))} numeric />
          <FormField label="메모" value={f.memo} onChange={(v) => setF((p) => ({ ...p, memo: v }))} />
          <FormField label="날짜" value={f.date} onChange={(v) => setF((p) => ({ ...p, date: v }))} placeholder="2026-04-01" />
          <TouchableOpacity style={styles.saveBtn} onPress={add}>
            <Text style={styles.saveBtnText}>추가</Text>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
}

/* ============================================================ raffle draw */

const PRODUCT_CATEGORIES = [
  '전자기기',
  '상품권/기프티콘',
  '뷰티',
  '패션',
  '식품/음료',
  '리빙/가전',
  '여행/숙박',
  '문화/티켓',
  '기타',
];

function ProductsSection() {
  const [products, setProducts] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'all' | 'active' | 'ended'>('all');
  const [editing, setEditing] = useState<any | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [entries, setEntries] = useState<any[]>([]);

  const refresh = async () => {
    try {
      const [p, m, s, e] = await Promise.all([
        api('data?c=products').then((r) => r.json()),
        api('data?c=members').then((r) => r.json()),
        api('data?c=stores').then((r) => r.json()),
        api('data?c=entries').then((r) => r.json()),
      ]);
      setProducts(Array.isArray(p.items) ? p.items : []);
      setMembers(Array.isArray(m.items) ? m.items : []);
      setStores(Array.isArray(s.items) ? s.items : []);
      setEntries(Array.isArray(e.items) ? e.items : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
  }, []);

  // 경품 예산 = 활성 매장 구독 매출의 50%.
  const activeStoreCount = stores.filter((s) => s.stage === '활성').length;
  const budget = Math.round(activeStoreCount * BURNING_MONTHLY_FEE * PRIZE_BUDGET_RATE);
  const activeProducts = products.filter((p) => p.status !== 'ended');
  const catalogValue = activeProducts.reduce((s, p) => s + (Number(p.price) || 0), 0);
  const use = budget > 0 ? Math.min(1, catalogValue / budget) : 0;
  const over = catalogValue > budget;

  const eligibleCount = (p: any) => {
    const counts = entryCountsFor(entries, p.id);
    const won = new Set((p.winnersList || []).map((w: any) => w.id));
    return Object.keys(counts).filter((uid) => counts[uid] > 0 && !won.has(uid)).length;
  };

  const isEnded = (p: any) => p.status === 'ended' || !!p.drawnAt;
  const searched = q.trim()
    ? products.filter((p) =>
        JSON.stringify(Object.values(p)).toLowerCase().includes(q.trim().toLowerCase())
      )
    : products;
  const running = searched.filter((p) => !isEnded(p));
  const done = searched.filter((p) => isEnded(p));
  const shown = tab === 'active' ? running : tab === 'ended' ? done : searched;
  const TABS = [
    { k: 'all', label: '전체', n: searched.length },
    { k: 'active', label: '🟢 진행중', n: running.length },
    { k: 'ended', label: '✅ 마감', n: done.length },
  ] as const;

  const save = async (item: any) => {
    const action = item.id ? 'update' : 'create';
    const numeric = ['price', 'pbCost', 'winners', 'stock', 'totalEntries'];
    const clean = { ...item };
    numeric.forEach((k) => (clean[k] = Number(clean[k]) || 0));
    await api('data?c=products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, item: clean }),
    });
    setEditing(null);
    toast(action === 'create' ? '상품이 등록되었습니다' : '저장되었습니다');
    refresh();
  };
  const del = async (id: string) => {
    const p = products.find((x) => x.id === id);
    if (!confirmAction(`'${p?.name || '상품'}'을(를) 삭제할까요?`)) return;
    await api('data?c=products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    });
    toast('삭제되었습니다');
    refresh();
  };

  return (
    <View>
      <View style={styles.h1Row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>상품(경품) 관리</Text>
          <Text style={styles.sectionSub}>
            응모 1회 = 설정 PB 차감. 많이 모을수록 여러 번 응모(확률↑). 예산은 구독 매출의 50%.
          </Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setEditing({ status: 'active' })}>
          <Ionicons name="add" size={18} color={colors.white} />
          <Text style={styles.addBtnText}>상품 등록</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.kpiRow}>
        <Kpi icon="gift" label="총 상품" value={`${products.length}`} />
        <Kpi icon="pulse" label="진행중" value={`${activeProducts.length}`} />
        <Kpi icon="pricetags" label="경품 시가 합계" value={won(catalogValue)} />
        <Kpi icon="wallet" label="남은 예산" value={won(Math.max(0, budget - catalogValue))} accent={over} />
      </View>

      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>경품 예산 집행 (50% 룰)</Text>
          <Text style={[styles.cardBig, over && { color: colors.coral }]}>{Math.round(use * 100)}%</Text>
        </View>
        <View style={styles.gaugeTrack}>
          <View style={[styles.gaugeFill, { width: `${use * 100}%`, backgroundColor: over ? colors.coral : colors.primary }]} />
        </View>
        <Text style={styles.muted}>
          등록 상품 시가 {won(catalogValue)} / 경품 예산 {won(budget)} (활성 매장 {activeStoreCount}곳)
          {over ? ' · ⚠ 예산 초과' : ''}
        </Text>
      </View>

      <View style={styles.statusRow}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.k}
            style={[styles.statusChip, tab === t.k && styles.statusChipOn]}
            onPress={() => setTab(t.k)}
          >
            <Text style={[styles.statusChipText, tab === t.k && styles.statusChipTextOn]}>
              {t.label} {t.n}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          value={q}
          onChangeText={setQ}
          placeholder="상품명 검색"
          placeholderTextColor={colors.textTertiary}
        />
        <Text style={styles.countText}>{shown.length}건</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} />
      ) : shown.length === 0 ? (
        <Empty text={tab === 'ended' ? '마감된 상품이 없어요.' : tab === 'active' ? '진행중 상품이 없어요.' : '등록된 상품이 없어요.'} />
      ) : (
        <View style={styles.table}>
          {shown.map((p, ri) => {
            const ended = isEnded(p);
            const winN = (p.winnersList || []).length;
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.prodRow, ri === shown.length - 1 && styles.rowLast]}
                activeOpacity={0.7}
                onPress={() => setDetail(p)}
              >
                {p.image ? (
                  <Image source={{ uri: p.image }} style={styles.prodThumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.prodThumb, styles.thumbEmpty]}>
                    <Ionicons name="gift-outline" size={18} color={colors.textTertiary} />
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 as any }}>
                  <View style={styles.prodTitleRow}>
                    <Text style={styles.memberName} numberOfLines={1}>{p.name || '-'}</Text>
                    <Badge value={ended ? '마감' : '진행중'} />
                  </View>
                  <Text style={styles.memberSub} numberOfLines={1}>
                    {p.category ? `${p.category} · ` : ''}{won(Number(p.price) || 0)} · 응모 {Number(p.pbCost) || 0}PB/회
                  </Text>
                  <View style={styles.prodMetaRow}>
                    <View style={styles.prodPill}>
                      <Ionicons name="people-outline" size={12} color={colors.primary} />
                      <Text style={styles.prodPillText}>응모가능 {eligibleCount(p)}</Text>
                    </View>
                    <View style={styles.prodPill}>
                      <Ionicons name="trophy-outline" size={12} color={colors.coral} />
                      <Text style={[styles.prodPillText, { color: colors.coral }]}>
                        {ended ? `당첨 ${winN}` : `${Number(p.winners) || 1}명 추첨`}
                      </Text>
                    </View>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {detail ? (
        <ProductDetail
          product={detail}
          members={members}
          products={products}
          entries={entries}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setEditing(detail);
            setDetail(null);
          }}
          onDelete={(id) => {
            setDetail(null);
            del(id);
          }}
          onRefresh={refresh}
        />
      ) : null}
      {editing ? (
        <ProductModal
          product={editing}
          budget={budget}
          catalogValue={catalogValue}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      ) : null}
    </View>
  );
}

/* ======================================================== 게시물 · 예약 관리
   앱이 쌓는 데이터(v2/posts.json, v2/reservations.json)를 어드민에서 조회하고
   부적절한 게시물은 내릴 수 있게 한다. 어드민이 새로 만드는 데이터가 아니므로
   '추가' 버튼 없이 조회·삭제·상태변경만 제공한다. */
function PostsSection() {
  const [posts, setPosts] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const PAGE = 30;

  const refresh = async () => {
    try {
      const [p, m] = await Promise.all([
        api('data?c=posts').then((r) => r.json()),
        api('data?c=members').then((r) => r.json()),
      ]);
      setPosts(Array.isArray(p.items) ? p.items : []);
      setMembers(Array.isArray(m.items) ? m.items : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
  }, []);

  const nameOf = useMemo(() => {
    const map: Record<string, any> = {};
    members.forEach((m) => (map[m.id] = m));
    return map;
  }, [members]);

  const del = async (p: any) => {
    if (!confirmAction(`이 게시물을 삭제할까요? 되돌릴 수 없습니다.\n\n"${String(p.caption || '').slice(0, 40)}"`)) return;
    await api('data?c=posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id: p.id }),
    });
    toast('게시물이 삭제되었습니다');
    refresh();
  };

  const shown = q.trim()
    ? posts.filter((p) =>
        JSON.stringify(Object.values(p)).toLowerCase().includes(q.trim().toLowerCase())
      )
    : posts;
  const paged = shown.slice(0, page * PAGE);
  const burning = posts.filter((p) => p.isBurning).length;
  const privateN = posts.filter((p) => p.isPrivate).length;

  return (
    <View>
      <SectionTitle title="게시물 관리" sub="앱 사용자가 올린 게시물 · 부적절한 글은 여기서 내려요" />

      <View style={styles.kpiRow}>
        <Kpi icon="images" label="전체 게시물" value={`${posts.length}`} />
        <Kpi icon="flame" label="버닝 리뷰" value={`${burning}`} accent />
        <Kpi icon="lock-closed" label="비공개" value={`${privateN}`} />
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          value={q}
          onChangeText={setQ}
          placeholder="내용·매장·작성자 검색"
          placeholderTextColor={colors.textTertiary}
        />
        <Text style={styles.countText}>{shown.length}건</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} />
      ) : shown.length === 0 ? (
        <Empty text={q ? '검색 결과가 없어요.' : '올라온 게시물이 없어요.'} />
      ) : (
        <View style={styles.table}>
          {paged.map((p, ri) => {
            const author = nameOf[p.authorId];
            return (
              <View key={p.id} style={[styles.prodRow, ri === paged.length - 1 && styles.rowLast]}>
                {p.image ? (
                  <Image source={{ uri: p.image }} style={styles.prodThumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.prodThumb, styles.thumbEmpty]}>
                    <Ionicons name="chatbox-outline" size={18} color={colors.textTertiary} />
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 as any }}>
                  <View style={styles.prodTitleRow}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {author?.name || '알 수 없음'} {author?.handle ? `· ${author.handle}` : ''}
                    </Text>
                    {p.isBurning ? <Badge value="버닝" /> : null}
                  </View>
                  <Text style={styles.memberSub} numberOfLines={2}>
                    {String(p.caption || '(내용 없음)')}
                  </Text>
                  <Text style={styles.recentMeta} numberOfLines={1}>
                    {[
                      p.store,
                      p.isPrivate ? '비공개' : '공개',
                      `저장 ${Number(p.saveCount) || 0}`,
                      `댓글 ${(p.comments || []).length}`,
                      new Date(Number(p.createdAt) || 0).toISOString().slice(0, 10),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => del(p)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color={colors.coral} />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      {paged.length < shown.length ? (
        <TouchableOpacity style={styles.pageBtn} onPress={() => setPage((n) => n + 1)}>
          <Text style={styles.pageBtnText}>더 보기 ({paged.length}/{shown.length})</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const RESERVATION_STATUS = ['예약', '방문완료', '취소'];

function ReservationsSection() {
  const [items, setItems] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | string>('all');

  const refresh = async () => {
    try {
      const [r, m] = await Promise.all([
        api('data?c=reservations').then((res) => res.json()),
        api('data?c=members').then((res) => res.json()),
      ]);
      setItems(Array.isArray(r.items) ? r.items : []);
      setMembers(Array.isArray(m.items) ? m.items : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
  }, []);

  const nameOf = useMemo(() => {
    const map: Record<string, any> = {};
    members.forEach((m) => (map[m.id] = m));
    return map;
  }, [members]);

  const setStatus = async (item: any, status: string) => {
    await api('data?c=reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', item: { ...item, status } }),
    });
    toast(`'${status}' 로 변경되었습니다`);
    refresh();
  };

  const searched = q.trim()
    ? items.filter((r) =>
        JSON.stringify(Object.values(r)).toLowerCase().includes(q.trim().toLowerCase())
      )
    : items;
  const shown = filter === 'all' ? searched : searched.filter((r) => (r.status || '예약') === filter);
  const countOf = (s: string) => items.filter((r) => (r.status || '예약') === s).length;

  return (
    <View>
      <SectionTitle title="예약 관리" sub="앱에서 들어온 매장 방문 예약 · 상태를 여기서 바꿔요" />

      <View style={styles.kpiRow}>
        <Kpi icon="calendar" label="전체 예약" value={`${items.length}`} />
        <Kpi icon="time" label="예약 대기" value={`${countOf('예약')}`} accent />
        <Kpi icon="checkmark-circle" label="방문 완료" value={`${countOf('방문완료')}`} />
        <Kpi icon="close-circle" label="취소" value={`${countOf('취소')}`} />
      </View>

      <View style={styles.statusRow}>
        {['all', ...RESERVATION_STATUS].map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.statusChip, filter === s && styles.statusChipOn]}
            onPress={() => setFilter(s)}
          >
            <Text style={[styles.statusChipText, filter === s && styles.statusChipTextOn]}>
              {s === 'all' ? `전체 ${items.length}` : `${s} ${countOf(s)}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          value={q}
          onChangeText={setQ}
          placeholder="매장·예약자 검색"
          placeholderTextColor={colors.textTertiary}
        />
        <Text style={styles.countText}>{shown.length}건</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} />
      ) : shown.length === 0 ? (
        <Empty text={q || filter !== 'all' ? '해당하는 예약이 없어요.' : '들어온 예약이 없어요.'} />
      ) : (
        <View style={styles.table}>
          {shown.map((r, ri) => {
            const who = nameOf[r.uid];
            return (
              <View key={r.id} style={[styles.prodRow, ri === shown.length - 1 && styles.rowLast]}>
                <View style={{ flex: 1, minWidth: 0 as any }}>
                  <View style={styles.prodTitleRow}>
                    <Text style={styles.memberName} numberOfLines={1}>{r.storeName || '-'}</Text>
                    <Badge value={r.status || '예약'} />
                  </View>
                  <Text style={styles.memberSub} numberOfLines={1}>
                    {[
                      who?.name || '알 수 없음',
                      who?.handle,
                      `${r.date || '-'} ${r.time || ''}`.trim(),
                      `${Number(r.people) || 1}명`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <Dropdown
                  value={r.status || '예약'}
                  options={RESERVATION_STATUS}
                  onChange={(v) => setStatus(r, v)}
                />
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

/* 경품 응모권 집계 — 앱에서 실제로 응모(PB 차감)한 기록 v2/entries.json 이 근거다.
   예전에는 '보유 PB ÷ 응모비용' 으로 추정했는데, 응모하면 PB가 차감되는 구조라
   실제로 응모한 사람일수록 오히려 응모권이 줄어드는 정반대 결과가 나왔다.
   응모를 한 번도 안 한 회원이 당첨되는 것도 막는다. */
function entryCountsFor(entries: any[], productId: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) {
    if (!e || e.productId !== productId) continue;
    const uid = String(e.uid || '');
    if (!uid) continue;
    out[uid] = (out[uid] || 0) + (Number(e.count) || 0);
  }
  return out;
}

// 상품 상세 — 응모 현황·대상자·추첨(이력·중복방지·발표)·수정.
function ProductDetail({
  product,
  members,
  products,
  entries,
  onClose,
  onEdit,
  onDelete,
  onRefresh,
}: {
  product: any;
  members: any[];
  products: any[];
  entries: any[];
  onClose: () => void;
  onEdit: () => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}) {
  useScrollLock();
  const [p, setP] = useState<any>(product);
  const [preview, setPreview] = useState<any[] | null>(null);
  const [excludeGlobal, setExcludeGlobal] = useState(false);
  const [saving, setSaving] = useState(false);

  const cost = Number(p.pbCost) || 1; // 응모 1회 비용
  const n = Number(p.winners) || 1;
  const alreadyWon: any[] = p.winnersList || [];
  const wonIds = new Set(alreadyWon.map((w) => w.id));
  const globalWonIds = new Set<string>();
  products.forEach((pr) => (pr.winnersList || []).forEach((w: any) => globalWonIds.add(w.id)));

  // 응모권 = 앱에서 실제로 응모한 횟수. 여러 번 응모할수록 확률이 올라간다.
  const counts = entryCountsFor(entries, p.id);
  const entriesOf = (m: any) => counts[m.id] || 0;
  const eligible = members
    .filter(
      (m) =>
        entriesOf(m) >= 1 &&
        !wonIds.has(m.id) &&
        (!excludeGlobal || !globalWonIds.has(m.id))
    )
    .sort((a, b) => entriesOf(b) - entriesOf(a));
  const totalTickets = eligible.reduce((s, m) => s + entriesOf(m), 0);

  // 응모권 수만큼 가중 추첨, 당첨자는 중복 없이.
  const run = () => {
    let pool: any[] = [];
    eligible.forEach((m) => {
      for (let i = 0; i < entriesOf(m); i++) pool.push(m);
    });
    const picked: any[] = [];
    const target = Math.min(n, eligible.length);
    while (picked.length < target && pool.length) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      picked.push(pick);
      pool = pool.filter((m) => m.id !== pick.id);
    }
    setPreview(picked);
  };

  const confirm = async () => {
    if (!preview || !preview.length) return;
    setSaving(true);
    try {
      const winnersList = [
        ...alreadyWon,
        ...preview.map((w) => ({ id: w.id, name: w.name, handle: w.handle, pb: Number(w.pb) || 0, date: todayStr() })),
      ];
      const updated = { ...p, winnersList, drawnAt: todayStr(), status: 'ended' };
      await api('data?c=products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', item: updated }),
      });
      // 이 상품의 '추첨대기' 배송 항목 제거 → 실제 당첨자 항목으로 대체.
      try {
        const sr = await api('data?c=shipments');
        const sd = await sr.json();
        const placeholders = (sd.items || []).filter(
          (s: any) => (s.productId === p.id || s.product === p.name) && !s.winnerName
        );
        for (const ph of placeholders) {
          await api('data?c=shipments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', id: ph.id }),
          });
        }
      } catch {
        // ignore
      }
      for (const w of preview) {
        await api('data?c=shipments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create',
            item: {
              productId: p.id,
              // 당첨자 uid — 앱의 '당첨' 탭이 이 값으로 배송 상태를 찾는다.
              winnerId: w.id,
              product: p.name,
              image: p.image || '',
              winnerName: w.name,
              method: p.method || '택배 배송',
              address: '',
              contact: w.handle || '',
              tracking: '',
              serial: '',
              pickupPlace: '',
              reviewed: '미작성',
              status: '준비',
            },
          }),
        });
      }
      // 당첨자에게 앱 알림 발송 — 이게 없으면 당첨돼도 사용자가 알 수 없다.
      let notified = 0;
      try {
        const nr = await api('data?c=members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'notify',
            uids: preview.map((w) => w.id),
            type: 'raffle',
            title: '🎉 경품에 당첨되셨어요!',
            body: `'${p.name}' 에 당첨되셨습니다. 마이 > 당첨 탭에서 확인해 주세요.`,
          }),
        });
        const nd = await nr.json();
        notified = Number(nd?.sent) || 0;
      } catch {
        // 알림 실패가 추첨 확정을 되돌리지는 않는다.
      }
      setP(updated);
      setPreview(null);
      toast(`${preview.length}명 당첨 확정 · 배송 생성 · 알림 ${notified}건 발송`);
      onRefresh();
    } catch {
      alert('추첨 저장 오류');
    } finally {
      setSaving(false);
    }
  };

  const burningNeeded = Math.ceil(cost / PB_PER_BURNING);

  return (
    <Portal>
      <View style={styles.drawerOverlay}>
        <TouchableOpacity style={styles.drawerBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.drawerPanel}>
          <View style={styles.drawerHead}>
            <Text style={styles.drawerTitle} numberOfLines={1}>상품 상세</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.drawerBody} showsVerticalScrollIndicator={false}>
            <View style={styles.staffProfile}>
              {p.image ? (
                <Image source={{ uri: p.image }} style={styles.prodHero} resizeMode="cover" />
              ) : (
                <View style={[styles.prodHero, styles.thumbEmpty]}>
                  <Ionicons name="gift-outline" size={26} color={colors.textTertiary} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.staffName} numberOfLines={2}>{p.name || '-'}</Text>
                {p.brand || p.category ? (
                  <Text style={styles.muted}>{[p.brand, p.category].filter(Boolean).join(' · ')}</Text>
                ) : null}
                <View style={styles.staffMetaRow}>
                  <Badge value={p.drawnAt ? '추첨완료' : p.status === 'ended' ? 'ended' : 'active'} />
                  {p.announcementDate ? <Text style={styles.muted}>발표 {p.announcementDate}</Text> : null}
                </View>
              </View>
              <TouchableOpacity style={styles.ckEditBtn} onPress={onEdit}>
                <Ionicons name="create-outline" size={15} color={colors.primary} />
                <Text style={styles.ckEditText}>수정</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.staffStatGrid}>
              <View style={styles.staffStat}>
                <Text style={styles.staffStatV}>{won(Number(p.price) || 0)}</Text>
                <Text style={styles.staffStatL}>시가</Text>
              </View>
              <View style={styles.staffStat}>
                <Text style={styles.staffStatV}>{cost} PB</Text>
                <Text style={styles.staffStatL}>응모 1회 비용</Text>
              </View>
              <View style={styles.staffStat}>
                <Text style={[styles.staffStatV, { color: colors.coral }]}>{totalTickets}</Text>
                <Text style={styles.staffStatL}>총 응모권 ({eligible.length}명)</Text>
              </View>
              <View style={styles.staffStat}>
                <Text style={styles.staffStatV}>{n}명</Text>
                <Text style={styles.staffStatL}>당첨 인원</Text>
              </View>
            </View>

            <Text style={styles.muted}>
              응모 1회 = {cost} PB (버닝 리뷰 {burningNeeded}회) · 많이 모을수록 여러 번 응모 = 당첨 확률↑ · 일반 회원만
            </Text>

            {/* 이미 당첨된 회원 */}
            {alreadyWon.length ? (
              <>
                <Text style={styles.sLabel}>당첨자 {alreadyWon.length}명{p.drawnAt ? ` · ${p.drawnAt}` : ''}</Text>
                <View style={styles.card}>
                  {alreadyWon.map((w, i) => (
                    <View key={w.id + i} style={[styles.storeLine, i < alreadyWon.length - 1 && styles.storeLineBorder]}>
                      <Text style={[styles.recentName, { flex: 1 }]} numberOfLines={1}>🎉 {w.name}</Text>
                      <Text style={styles.recentMeta}>{w.handle} · {w.pb}PB</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {/* 응모 대상자 (응모권 순) */}
            <Text style={styles.sLabel}>응모 대상자 · {eligible.length}명 · 총 {totalTickets}응모권</Text>
            {eligible.length === 0 ? (
              <View style={styles.card}>
                <Text style={[styles.muted, { padding: spacing.md }]}>1회 이상 응모 가능한 회원이 없어요.</Text>
              </View>
            ) : (
              <View style={styles.card}>
                {eligible.slice(0, 8).map((m, i) => (
                  <View key={m.id} style={[styles.storeLine, i < Math.min(eligible.length, 8) - 1 && styles.storeLineBorder]}>
                    <Text style={[styles.recentName, { flex: 1 }]} numberOfLines={1}>{m.name}</Text>
                    <Text style={styles.recentMeta}>{entriesOf(m)}응모권 · {Number(m.pb) || 0}PB</Text>
                  </View>
                ))}
                {eligible.length > 8 ? <Text style={[styles.muted, { padding: spacing.md }]}>외 {eligible.length - 8}명…</Text> : null}
              </View>
            )}

            {/* 추첨 */}
            <Text style={styles.sLabel}>추첨</Text>
            <TouchableOpacity style={styles.checkRow} onPress={() => setExcludeGlobal((v) => !v)} activeOpacity={0.8}>
              <Ionicons name={excludeGlobal ? 'checkbox' : 'square-outline'} size={20} color={excludeGlobal ? colors.primary : colors.textTertiary} />
              <Text style={styles.checkLabel}>다른 경품 당첨자도 제외 (중복 당첨 방지)</Text>
            </TouchableOpacity>

            {!preview ? (
              <TouchableOpacity
                style={[styles.acctBtn, eligible.length === 0 && { opacity: 0.5 }]}
                onPress={run}
                disabled={eligible.length === 0}
              >
                <Ionicons name="sparkles" size={16} color={colors.white} />
                <Text style={styles.acctBtnText}>🎲 {alreadyWon.length ? '추가 추첨' : '추첨 실행'} ({Math.min(n, eligible.length)}명)</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.card}>
                <Text style={styles.fLabel}>추첨 결과 · {preview.length}명</Text>
                {preview.map((w) => (
                  <View key={w.id} style={styles.actRow}>
                    <Text style={styles.actNote}>🎉 {w.name} ({w.handle})</Text>
                    <Text style={styles.actDate}>{w.pb} PB</Text>
                  </View>
                ))}
                <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
                  <TouchableOpacity style={[styles.rejectBtn, { flex: 1 }]} onPress={run}>
                    <Text style={styles.rejectText}>다시</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.saveBtn, { flex: 1.6 }]} onPress={confirm} disabled={saving}>
                    <Text style={styles.saveBtnText}>{saving ? '확정 중…' : '당첨 확정 → 배송'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <TouchableOpacity style={styles.ckDelete} onPress={() => onDelete(p.id)}>
              <Ionicons name="trash-outline" size={15} color={colors.danger} />
              <Text style={styles.ckDeleteText}>이 상품 삭제</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Portal>
  );
}

// 상품 등록/수정 — 전용 폼(이미지·그룹·도우미·상태칩·예산 미리보기).
function ProductModal({
  product,
  budget,
  catalogValue,
  onClose,
  onSave,
}: {
  product: any;
  budget: number;
  catalogValue: number;
  onClose: () => void;
  onSave: (item: any) => void;
}) {
  const isNew = !product.id;
  const [f, setF] = useState<any>({ status: 'active', winners: 1, stock: 100, pbCost: 10, ...product });
  const [uploading, setUploading] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  const price = Number(f.price) || 0;
  const cut = Number(f.pbCost) || 0;
  const burning = cut > 0 ? Math.ceil(cut / PB_PER_BURNING) : 0;
  const prevPrice = isNew ? 0 : Number(product.price) || 0;
  const projected = catalogValue - prevPrice + price;
  const over = f.status !== 'ended' && projected > budget;
  const canSave = String(f.name || '').trim().length > 0;

  const pickImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        alert('사진 접근 권한이 필요합니다.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.6,
        base64: true,
        allowsMultipleSelection: false,
      });
      if (res.canceled) return;
      const a: any = res.assets[0];
      const dataUrl = a.base64 ? `data:${a.mimeType || 'image/jpeg'};base64,${a.base64}` : a.uri;
      setUploading(true);
      const r = await api('upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
      });
      const d = await r.json();
      if (d.url) set('image', d.url);
      else alert('업로드 실패 (저장소 확인)');
    } catch {
      alert('이미지 업로드 오류');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal title={isNew ? '상품 등록' : `${f.name || '상품'} 수정`} onClose={onClose} size="wide">
      {/* 이미지 */}
      <Text style={styles.fLabel}>상품 사진</Text>
      <TouchableOpacity style={styles.prodImgBox} onPress={pickImage} activeOpacity={0.85} disabled={uploading}>
        {f.image ? (
          <Image source={{ uri: f.image }} style={styles.prodImgPreview} resizeMode="cover" />
        ) : (
          <View style={styles.prodImgEmpty}>
            <Ionicons name={uploading ? 'cloud-upload-outline' : 'image-outline'} size={30} color={colors.textTertiary} />
            <Text style={styles.muted}>{uploading ? '업로드 중…' : '탭해서 사진 올리기'}</Text>
          </View>
        )}
        {f.image && !uploading ? (
          <View style={styles.prodImgEdit}>
            <Ionicons name="camera" size={14} color={colors.white} />
            <Text style={styles.prodImgEditText}>변경</Text>
          </View>
        ) : null}
      </TouchableOpacity>

      <FormField label="상품명 *" value={String(f.name ?? '')} onChange={(v) => set('name', v)} placeholder="예: 아이폰 17 PRO" />
      <FormField label="브랜드" value={String(f.brand ?? '')} onChange={(v) => set('brand', v)} placeholder="예: Apple · 신라호텔" />
      <Dropdown
        label="카테고리"
        value={String(f.category ?? '')}
        options={PRODUCT_CATEGORIES}
        onChange={(v) => set('category', v)}
        placeholder="카테고리 선택"
        searchable
      />
      <Dropdown
        label="기본 수령 방식 (추첨 시 배송 항목에 적용)"
        value={String(f.method ?? '택배 배송')}
        options={SHIP_METHODS}
        onChange={(v) => set('method', v)}
      />

      <View style={styles.formRow}>
        <View style={{ flex: 1 }}>
          <FormField label="시가 (원)" value={String(f.price ?? '')} onChange={(v) => set('price', v)} numeric placeholder="1790000" />
        </View>
        <View style={{ flex: 1 }}>
          <FormField label="당첨 인원" value={String(f.winners ?? '')} onChange={(v) => set('winners', v)} numeric placeholder="1" />
        </View>
      </View>

      <FormField
        label="응모 비용 (1회) *"
        value={String(f.pbCost ?? '')}
        onChange={(v) => set('pbCost', v)}
        numeric
        placeholder="10"
      />
      <View style={styles.cutHint}>
        <Ionicons name="flame" size={13} color={colors.coral} />
        <Text style={styles.cutHintText}>
          응모 1회 = {cut} PB 차감 (버닝 리뷰 {burning}회) · 많이 모을수록 여러 번 응모 = 당첨 확률↑
        </Text>
      </View>

      <View style={styles.formRow}>
        <View style={{ flex: 1 }}>
          <FormField label="응모 한도" value={String(f.stock ?? '')} onChange={(v) => set('stock', v)} numeric placeholder="100" />
        </View>
        <View style={{ flex: 1 }}>
          <FormField label="발표일" value={String(f.announcementDate ?? '')} onChange={(v) => set('announcementDate', v)} placeholder="4월 20일" />
        </View>
      </View>

      <Text style={styles.fLabel}>상태</Text>
      <View style={styles.chipRow}>
        {[
          { v: 'active', l: '🟢 진행중 (앱 노출)' },
          { v: 'ended', l: '✅ 마감 (숨김)' },
        ].map((o) => (
          <TouchableOpacity
            key={o.v}
            style={[styles.stageChip, f.status === o.v && { backgroundColor: colors.primary, borderColor: colors.primary }]}
            onPress={() => set('status', o.v)}
          >
            <Text style={[styles.stageChipText, f.status === o.v && { color: '#fff' }]}>{o.l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 예산 미리보기 */}
      <View style={[styles.card, over && { borderColor: colors.coral, borderWidth: 1 }]}>
        <View style={styles.pbRow}>
          <Text style={styles.pbLabel}>이 상품 시가</Text>
          <Text style={styles.pbVal}>{won(price)}</Text>
        </View>
        <View style={styles.pbRow}>
          <Text style={styles.pbLabel}>등록 후 총 시가 (진행중)</Text>
          <Text style={[styles.pbVal, over && { color: colors.coral }]}>{won(projected)}</Text>
        </View>
        <View style={styles.pbRow}>
          <Text style={styles.pbLabel}>경품 예산 (구독 50%)</Text>
          <Text style={styles.pbVal}>{won(budget)}</Text>
        </View>
        {over ? <Text style={[styles.muted, { color: colors.coral }]}>⚠ 예산을 초과해요. 시가를 낮추거나 예산(매장)을 늘려야 해요.</Text> : null}
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, !canSave && { opacity: 0.5 }]}
        onPress={() => onSave(f)}
        disabled={!canSave}
      >
        <Text style={styles.saveBtnText}>{isNew ? '상품 등록' : '저장'}</Text>
      </TouchableOpacity>
    </Modal>
  );
}

/* ====================================================== 배송 · 수여 관리 */

const SHIP_METHODS = ['택배 배송', '상품권(일련번호)', '방문 수령', '기타'];
const STATUS_BY_METHOD: Record<string, string[]> = {
  '택배 배송': ['준비', '발송', '완료'],
  '상품권(일련번호)': ['준비', '발급완료', '완료'],
  '방문 수령': ['준비', '수령완료'],
  기타: ['준비', '처리중', '완료'],
};

function ShipmentsSection() {
  const [products, setProducts] = useState<any[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<any | null>(null);

  const refresh = async () => {
    try {
      const [p, s, rv, e] = await Promise.all([
        api('data?c=products').then((r) => r.json()),
        api('data?c=shipments').then((r) => r.json()),
        api('data?c=reviews').then((r) => r.json()),
        api('data?c=entries').then((r) => r.json()),
      ]);
      setProducts(Array.isArray(p.items) ? p.items : []);
      setShipments(Array.isArray(s.items) ? s.items : []);
      setReviews(Array.isArray(rv.items) ? rv.items : []);
      setEntries(Array.isArray(e.items) ? e.items : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
  }, []);

  // 당첨자 후기 자동 매칭: 당첨자(이름/핸들)가 당첨 이후 남긴 리뷰가 있으면 작성완료.
  const nk = (x: any) => String(x || '').trim().replace(/^@/, '').toLowerCase();
  const autoReviewed = (s: any) => {
    const wn = nk(s.winnerName);
    const wh = nk(s.contact);
    const since = Number(s.createdAt) || 0;
    return reviews.some((r) => {
      const rn = nk(r.author);
      const rh = nk(r.handle);
      const match = (wn && (rn === wn || rh === wn)) || (wh && (rh === wh || rn === wh));
      return match && (Number(r.createdAt) || 0) >= since;
    });
  };
  const effReviewed = (s: any) => s.reviewed === '작성완료' || autoReviewed(s);

  const eligibleCount = (p: any) => Object.keys(entryCountsFor(entries, p.id)).length;
  // 추첨 대기 = 진행중(마감/추첨 전) 상품 — 상품에서 직접 도출(항상 최신).
  const pending = products.filter((p) => !p.drawnAt && (p.winnersList || []).length === 0 && p.status !== 'ended');
  // 당첨자 배송 = 실제 당첨자가 있는 배송 레코드.
  const deliveries = shipments.filter((s) => s.winnerName);
  const byStatus = (st: string) => deliveries.filter((s) => (s.status || '준비') === st).length;
  const dShown = q.trim()
    ? deliveries.filter((s) => JSON.stringify(Object.values(s)).toLowerCase().includes(q.trim().toLowerCase()))
    : deliveries;

  const save = async (item: any) => {
    const action = item.id ? 'update' : 'create';
    await api('data?c=shipments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, item }),
    });
    setEditing(null);
    toast(action === 'create' ? '배송이 추가되었습니다' : '저장되었습니다');
    refresh();
  };
  const del = async (id: string) => {
    if (!confirmAction('이 배송 항목을 삭제할까요?')) return;
    await api('data?c=shipments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    });
    toast('삭제되었습니다');
    refresh();
  };

  return (
    <View>
      <View style={styles.h1Row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>배송 · 수여 관리</Text>
          <Text style={styles.sectionSub}>추첨 대기 상품 + 당첨자 배송(주소·송장·상태)</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setEditing({ status: '준비' })}>
          <Ionicons name="add" size={18} color={colors.white} />
          <Text style={styles.addBtnText}>배송 추가</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.kpiRow}>
        <Kpi icon="dice" label="추첨 대기" value={`${pending.length}`} accent />
        <Kpi icon="cube" label="배송 준비" value={`${byStatus('준비')}`} />
        <Kpi icon="airplane" label="발송" value={`${byStatus('발송')}`} />
        <Kpi icon="checkmark-done" label="완료" value={`${byStatus('완료')}`} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} />
      ) : (
        <>
          <Text style={styles.h2}>🎲 추첨 대기 · {pending.length}</Text>
          {pending.length === 0 ? (
            <Empty text="추첨 대기 상품이 없어요." />
          ) : (
            <View style={styles.table}>
              {pending.map((p, ri) => (
                <View key={p.id} style={[styles.prodRow, ri === pending.length - 1 && styles.rowLast]}>
                  {p.image ? (
                    <Image source={{ uri: p.image }} style={styles.prodThumb} resizeMode="cover" />
                  ) : (
                    <View style={[styles.prodThumb, styles.thumbEmpty]}>
                      <Ionicons name="gift-outline" size={18} color={colors.textTertiary} />
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 as any }}>
                    <Text style={styles.memberName} numberOfLines={1}>{p.name || '-'}</Text>
                    <Text style={styles.memberSub} numberOfLines={1}>
                      응모가능 {eligibleCount(p)}명 · {Number(p.winners) || 1}명 추첨 예정
                    </Text>
                  </View>
                  <Badge value="추첨대기" />
                </View>
              ))}
            </View>
          )}
          <Text style={styles.muted}>상품(경품) 상세에서 추첨하면 당첨자 배송이 아래에 자동 생성돼요.</Text>

          <Text style={styles.h2}>📦 당첨자 배송 · {deliveries.length}</Text>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              value={q}
              onChangeText={setQ}
              placeholder="당첨자·상품·송장 검색"
              placeholderTextColor={colors.textTertiary}
            />
            <Text style={styles.countText}>{dShown.length}건</Text>
          </View>
          {dShown.length === 0 ? (
            <Empty text="배송 내역이 없어요." />
          ) : (
            <View style={styles.table}>
              {dShown.map((s, ri) => {
                const reviewed = effReviewed(s);
                const auto = reviewed && s.reviewed !== '작성완료' && autoReviewed(s);
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.prodRow, ri === dShown.length - 1 && styles.rowLast]}
                    activeOpacity={0.7}
                    onPress={() => setEditing(s)}
                  >
                    <View style={{ flex: 1, minWidth: 0 as any }}>
                      <View style={styles.prodTitleRow}>
                        <Text style={styles.memberName} numberOfLines={1}>{s.product || '-'}</Text>
                        <Badge value={s.status || '준비'} />
                      </View>
                      <Text style={styles.memberSub} numberOfLines={1}>
                        🎉 {s.winnerName || '-'} · {s.method || '택배 배송'}
                        {s.tracking ? ` · 송장 ${s.tracking}` : s.serial ? ` · ${s.serial}` : ''}
                      </Text>
                      <View style={styles.prodMetaRow}>
                        <View style={[styles.prodPill, reviewed ? { backgroundColor: colors.primarySoft } : { backgroundColor: colors.coralSoft }]}>
                          <Ionicons name={reviewed ? 'checkmark-circle' : 'ellipse-outline'} size={12} color={reviewed ? colors.primary : colors.coral} />
                          <Text style={[styles.prodPillText, !reviewed && { color: colors.coral }]}>
                            후기 {reviewed ? (auto ? '작성완료 (자동)' : '작성완료') : '미작성'}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <TouchableOpacity style={{ alignItems: 'flex-end' }} onPress={() => del(s.id)} hitSlop={6}>
                      <Ionicons name="trash-outline" size={17} color={colors.textTertiary} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </>
      )}

      {editing ? (
        <ShipmentModal
          shipment={editing}
          onClose={() => setEditing(null)}
          onSave={save}
          onDelete={
            editing.id
              ? (id) => {
                  setEditing(null);
                  del(id);
                }
              : undefined
          }
        />
      ) : null}
    </View>
  );
}

// 배송·수여 편집 — 수령 방식별 필드 + 당첨자 후기.
function ShipmentModal({
  shipment,
  onClose,
  onSave,
  onDelete,
}: {
  shipment: any;
  onClose: () => void;
  onSave: (item: any) => void;
  onDelete?: (id: string) => void;
}) {
  const [f, setF] = useState<any>({ status: '준비', method: '택배 배송', reviewed: '미작성', ...shipment });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const method = f.method || '택배 배송';
  const statusOptions = STATUS_BY_METHOD[method] || ['준비', '완료'];

  return (
    <Modal title={f.id ? `${f.product || '배송'} · ${f.winnerName || ''}` : '배송 추가'} onClose={onClose} size="wide">
      {f.id ? (
        <View style={styles.card}>
          <View style={styles.pbRow}>
            <Text style={styles.pbLabel}>상품</Text>
            <Text style={styles.pbVal}>{f.product || '-'}</Text>
          </View>
          <View style={styles.pbRow}>
            <Text style={styles.pbLabel}>당첨자</Text>
            <Text style={styles.pbVal}>🎉 {f.winnerName || '-'}</Text>
          </View>
        </View>
      ) : (
        <>
          <FormField label="상품" value={String(f.product ?? '')} onChange={(v) => set('product', v)} />
          <FormField label="당첨자" value={String(f.winnerName ?? '')} onChange={(v) => set('winnerName', v)} />
        </>
      )}

      <Text style={styles.fLabel}>수령 방식</Text>
      <View style={styles.chipRow}>
        {SHIP_METHODS.map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.stageChip, method === m && { backgroundColor: colors.primary, borderColor: colors.primary }]}
            onPress={() => {
              const opts = STATUS_BY_METHOD[m] || ['준비', '완료'];
              setF((p: any) => ({ ...p, method: m, status: opts.includes(p.status) ? p.status : opts[0] }));
            }}
          >
            <Text style={[styles.stageChipText, method === m && { color: '#fff' }]}>{m}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 방식별 필드 */}
      {method === '택배 배송' ? (
        <>
          <FormField label="배송 주소" value={String(f.address ?? '')} onChange={(v) => set('address', v)} />
          <View style={styles.formRow}>
            <View style={{ flex: 1 }}>
              <FormField label="연락처" value={String(f.contact ?? '')} onChange={(v) => set('contact', v)} />
            </View>
            <View style={{ flex: 1 }}>
              <FormField label="송장번호" value={String(f.tracking ?? '')} onChange={(v) => set('tracking', v)} />
            </View>
          </View>
        </>
      ) : method === '상품권(일련번호)' ? (
        <>
          <FormField label="일련번호 / 코드" value={String(f.serial ?? '')} onChange={(v) => set('serial', v)} placeholder="예: GIFT-1234-5678" />
          <FormField label="전달 연락처 (문자/카톡)" value={String(f.contact ?? '')} onChange={(v) => set('contact', v)} />
        </>
      ) : method === '방문 수령' ? (
        <>
          <FormField label="수령 장소" value={String(f.pickupPlace ?? '')} onChange={(v) => set('pickupPlace', v)} placeholder="예: PEED 본사 1층" />
          <View style={styles.formRow}>
            <View style={{ flex: 1 }}>
              <FormField label="수령 예정일" value={String(f.pickupDate ?? '')} onChange={(v) => set('pickupDate', v)} placeholder="2026-05-01" />
            </View>
            <View style={{ flex: 1 }}>
              <FormField label="연락처" value={String(f.contact ?? '')} onChange={(v) => set('contact', v)} />
            </View>
          </View>
        </>
      ) : (
        <>
          <FormField label="수여 메모" value={String(f.address ?? '')} onChange={(v) => set('address', v)} placeholder="수여 방법 상세" />
          <FormField label="연락처" value={String(f.contact ?? '')} onChange={(v) => set('contact', v)} />
        </>
      )}

      <Text style={styles.fLabel}>상태</Text>
      <View style={styles.chipRow}>
        {statusOptions.map((st) => (
          <TouchableOpacity
            key={st}
            style={[styles.stageChip, f.status === st && { backgroundColor: colors.primary, borderColor: colors.primary }]}
            onPress={() => set('status', st)}
          >
            <Text style={[styles.stageChipText, f.status === st && { color: '#fff' }]}>{st}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.fLabel}>당첨자 후기</Text>
      <View style={styles.chipRow}>
        {['미작성', '작성완료'].map((rv) => (
          <TouchableOpacity
            key={rv}
            style={[styles.stageChip, (f.reviewed || '미작성') === rv && { backgroundColor: rv === '작성완료' ? colors.primary : colors.coral, borderColor: rv === '작성완료' ? colors.primary : colors.coral }]}
            onPress={() => set('reviewed', rv)}
          >
            <Text style={[styles.stageChipText, (f.reviewed || '미작성') === rv && { color: '#fff' }]}>
              {rv === '작성완료' ? '✍️ 작성완료' : '미작성'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.muted}>당첨자가 수령 후 후기를 남겼는지 표시해요.</Text>

      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
        {f.id && onDelete ? (
          <TouchableOpacity style={styles.delDealBtn} onPress={() => onDelete(f.id)}>
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={[styles.saveBtn, { flex: 1 }]} onPress={() => onSave(f)}>
          <Text style={styles.saveBtnText}>저장</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

/* ============================================================ PB / 회원 */

const PB_TYPE_OPTS = [
  { v: 'issue', l: '발행 (+)' },
  { v: 'spend', l: '사용 (−)' },
  { v: 'reclaim', l: '회수 (−)' },
  { v: 'adjust', l: '보정 (±)' },
];
const PB_TYPE_LABEL: Record<string, string> = {
  issue: '발행',
  spend: '사용',
  reclaim: '회수',
  adjust: '보정',
};

// 회원 관리 = 일반 CollectionManager + 행별 'PB 조정' 액션.
const memberTypeOf = (m: any): '일반' | '기업' => (m?.memberType === '기업' ? '기업' : '일반');

// 소셜 로그인으로 가입했는지, 어드민이 직접 만든 계정인지 한눈에 구분한다.
const PROVIDER_KO: Record<string, string> = { kakao: '카카오', naver: '네이버', google: '구글' };
const joinPathOf = (m: any): string => PROVIDER_KO[String(m?.provider || '')] || '직접등록';

function genLoginId(seed: string) {
  const slug = (seed || '').replace(/[^a-z0-9]/gi, '').slice(0, 6).toLowerCase();
  return `store_${slug || 'biz'}${Math.random().toString(36).slice(2, 5)}`;
}
// 매장주 임시 비밀번호 (헷갈리는 문자 제외).
function genPassword() {
  const cs = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += cs[Math.floor(Math.random() * cs.length)];
  return s;
}
// 일반 회원 고유 초대 코드 (대문자, 헷갈리는 문자 제외).
function genReferralCode() {
  const cs = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += cs[Math.floor(Math.random() * cs.length)];
  return s;
}

function MembersSection() {
  const [members, setMembers] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'all' | '일반' | '기업'>('all');
  const [editing, setEditing] = useState<any | null>(null);
  const [adjust, setAdjust] = useState<any | null>(null);
  const [detail, setDetail] = useState<any | null>(null);

  const refresh = async () => {
    try {
      const [m, s] = await Promise.all([
        api('data?c=members').then((r) => r.json()),
        api('data?c=stores').then((r) => r.json()),
      ]);
      setMembers(Array.isArray(m.items) ? m.items : []);
      setStores(Array.isArray(s.items) ? s.items : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
  }, []);

  const activeStores = stores.filter((s) => s.stage === '활성');
  const list = q.trim()
    ? members.filter((m) =>
        JSON.stringify(Object.values(m)).toLowerCase().includes(q.trim().toLowerCase())
      )
    : members;
  const normal = list.filter((m) => memberTypeOf(m) === '일반');
  const corp = list.filter((m) => memberTypeOf(m) === '기업');
  const shown = tab === '일반' ? normal : tab === '기업' ? corp : list;
  const TABS = [
    { k: 'all', label: '전체', n: list.length },
    { k: '일반', label: '👤 일반', n: normal.length },
    { k: '기업', label: '🏢 기업', n: corp.length },
  ] as const;
  const totalPb = members.reduce((s, m) => s + (Number(m.pb) || 0), 0);

  const save = async (item: any) => {
    const action = item.id ? 'update' : 'create';
    if (item.memberType === '기업') {
      if (!item.loginId) item.loginId = genLoginId(item.companyName);
      if (!item.password) item.password = genPassword();
    } else if (!item.referralCode) {
      item.referralCode = genReferralCode();
    }
    await api('data?c=members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, item }),
    });
    setEditing(null);
    toast(action === 'create' ? '회원이 추가되었습니다' : '저장되었습니다');
    refresh();
  };
  const del = async (id: string) => {
    const m = members.find((x) => x.id === id);
    if (!confirmAction(`'${m?.companyName || m?.name || '회원'}'을(를) 삭제할까요?`)) return;
    await api('data?c=members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    });
    toast('삭제되었습니다');
    refresh();
  };
  const newMember = (type: '일반' | '기업') =>
    setEditing({ memberType: type, status: 'active', joinedAt: todayStr(), pb: 0 });

  return (
    <View>
      <View style={styles.h1Row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>회원 관리</Text>
          <Text style={styles.sectionSub}>
            일반(앱 유저) · 기업(버닝 매장주 계정). 활성 매장마다 1계정 발급.
          </Text>
        </View>
        <TouchableOpacity style={styles.addBtnGhost} onPress={() => newMember('일반')}>
          <Ionicons name="person-add-outline" size={16} color={colors.primary} />
          <Text style={styles.addBtnGhostText}>일반 추가</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.addBtn} onPress={() => newMember('기업')}>
          <Ionicons name="business-outline" size={16} color={colors.white} />
          <Text style={styles.addBtnText}>기업 추가</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.kpiRow}>
        <Kpi icon="people" label="총 회원" value={`${members.length}`} />
        <Kpi icon="person" label="일반 회원" value={`${members.filter((m) => memberTypeOf(m) === '일반').length}`} />
        <Kpi icon="business" label="기업(매장 계정)" value={`${members.filter((m) => memberTypeOf(m) === '기업').length}`} accent />
        <Kpi icon="diamond" label="유통 PB" value={`${totalPb}`} />
      </View>

      <View style={styles.statusRow}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.k}
            style={[styles.statusChip, tab === t.k && styles.statusChipOn]}
            onPress={() => setTab(t.k)}
          >
            <Text style={[styles.statusChipText, tab === t.k && styles.statusChipTextOn]}>
              {t.label} {t.n}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          value={q}
          onChangeText={setQ}
          placeholder="이름·상호·아이디·담당자 검색"
          placeholderTextColor={colors.textTertiary}
        />
        <Text style={styles.countText}>{shown.length}건</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} />
      ) : shown.length === 0 ? (
        <Empty text="회원이 없어요." />
      ) : (
        <View style={styles.table}>
          {shown.map((m, ri) => {
            const corpRow = memberTypeOf(m) === '기업';
            return (
              <TouchableOpacity
                key={m.id}
                style={[styles.memberRow, ri === shown.length - 1 && styles.rowLast]}
                activeOpacity={0.7}
                onPress={() => setDetail(m)}
              >
                <View style={[styles.mTag, corpRow ? styles.mTagCorp : styles.mTagUser]}>
                  <Text style={[styles.mTagText, corpRow ? { color: colors.primary } : { color: colors.textSecondary }]}>
                    {corpRow ? '기업' : '일반'}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {corpRow ? m.companyName || m.name || '-' : m.name || '-'}
                  </Text>
                  <Text style={styles.memberSub} numberOfLines={1}>
                    {corpRow
                      ? `${m.managerName || '담당자 미정'} · ${m.linkedStoreName || '매장 미연결'}${m.loginId ? ` · @${m.loginId}` : ''}`
                      : `${joinPathOf(m)} · ${m.handle || ''} · ${Number(m.pb) || 0}PB${m.referralCode ? ` · 코드 ${m.referralCode}` : ''} · 초대 ${Number(m.referralCount) || 0}명`}
                  </Text>
                </View>
                <Badge value={m.status || 'active'} />
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {detail ? (
        <MemberDetail
          member={detail}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setEditing(detail);
            setDetail(null);
          }}
          onAdjust={() => {
            setAdjust(detail);
            setDetail(null);
          }}
          onDelete={(id) => {
            setDetail(null);
            del(id);
          }}
        />
      ) : null}
      {editing ? (
        <MemberModal
          member={editing}
          activeStores={activeStores}
          onClose={() => setEditing(null)}
          onSave={save}
          onDelete={del}
        />
      ) : null}
      {adjust ? (
        <PbAdjustModal
          member={adjust}
          onClose={() => setAdjust(null)}
          onDone={() => {
            setAdjust(null);
            refresh();
          }}
        />
      ) : null}
    </View>
  );
}

// 연결 매장 선택 — 검색 가능한 목록(수백~수천 매장 대응).
function StorePicker({
  stores,
  valueName,
  onPick,
}: {
  stores: any[];
  valueName?: string;
  onPick: (s: any | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const list = query
    ? stores.filter(
        (s) =>
          String(s.storeName || '').toLowerCase().includes(query) ||
          String(s.region || '').toLowerCase().includes(query) ||
          String(s.category || '').toLowerCase().includes(query)
      )
    : stores;
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.fLabel}>연결 버닝 매장 (활성만)</Text>
      <TouchableOpacity style={styles.pickerBtn} onPress={() => setOpen((o) => !o)} activeOpacity={0.8}>
        <Ionicons name="storefront-outline" size={16} color={colors.textSecondary} />
        <Text style={[styles.pickerBtnText, !valueName && { color: colors.textTertiary }]} numberOfLines={1}>
          {valueName || '매장 선택 (검색)'}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textTertiary} />
      </TouchableOpacity>
      {open ? (
        <View style={styles.pickerPanel}>
          <View style={[styles.searchBar, { marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }]}>
            <Ionicons name="search" size={15} color={colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              value={q}
              onChangeText={setQ}
              placeholder="매장·지역·업종 검색"
              placeholderTextColor={colors.textTertiary}
              autoFocus
            />
            <Text style={styles.countText}>{list.length}</Text>
          </View>
          <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            <TouchableOpacity
              style={styles.pickRow}
              onPress={() => {
                onPick(null);
                setOpen(false);
                setQ('');
              }}
            >
              <Text style={[styles.pickRowText, { color: colors.textTertiary }]}>(연결 안 함)</Text>
            </TouchableOpacity>
            {list.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={styles.pickRow}
                onPress={() => {
                  onPick(s);
                  setOpen(false);
                  setQ('');
                }}
              >
                <Text style={styles.pickRowText} numberOfLines={1}>{s.storeName}</Text>
                <Text style={styles.pickRowSub} numberOfLines={1}>
                  {s.region}{s.category ? ` · ${s.category}` : ''}
                </Text>
              </TouchableOpacity>
            ))}
            {list.length === 0 ? (
              <Text style={[styles.muted, { padding: spacing.md }]}>검색 결과가 없어요.</Text>
            ) : null}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

// 회원 상세 — 오른쪽 사이드 패널 (일반/기업 유형별 정보).
function MemberDetail({
  member,
  onClose,
  onEdit,
  onAdjust,
  onDelete,
}: {
  member: any;
  onClose: () => void;
  onEdit: () => void;
  onAdjust: () => void;
  onDelete: (id: string) => void;
}) {
  useScrollLock();
  const m = member;
  const isCorp = memberTypeOf(m) === '기업';
  const title = isCorp ? m.companyName || m.name || '기업 회원' : m.name || '회원';
  const initial = (title || '?').slice(0, 1);

  return (
    <Portal>
      <View style={styles.drawerOverlay}>
        <TouchableOpacity style={styles.drawerBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.drawerPanel}>
          <View style={styles.drawerHead}>
            <Text style={styles.drawerTitle} numberOfLines={1}>회원 상세</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.drawerBody} showsVerticalScrollIndicator={false}>
            <View style={styles.staffProfile}>
              <View style={[styles.staffAvatar, isCorp && { backgroundColor: colors.textPrimary }]}>
                <Text style={styles.staffAvatarText}>{initial}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.staffName} numberOfLines={1}>{title}</Text>
                <View style={styles.staffMetaRow}>
                  <View style={[styles.posPill, !isCorp && { backgroundColor: colors.surfaceAlt }]}>
                    <Text style={[styles.posPillText, !isCorp && { color: colors.textSecondary }]}>
                      {isCorp ? '🏢 기업 (매장주)' : '👤 일반'}
                    </Text>
                  </View>
                  <Badge value={m.status || 'active'} />
                </View>
              </View>
              <TouchableOpacity style={styles.ckEditBtn} onPress={onEdit}>
                <Ionicons name="create-outline" size={15} color={colors.primary} />
                <Text style={styles.ckEditText}>수정</Text>
              </TouchableOpacity>
            </View>

            {!isCorp ? (
              <View style={styles.staffStatGrid}>
                <View style={styles.staffStat}>
                  <Text style={styles.staffStatV}>{Number(m.pb) || 0} PB</Text>
                  <Text style={styles.staffStatL}>보유 PB</Text>
                </View>
                <View style={styles.staffStat}>
                  <Text style={[styles.staffStatV, { color: colors.coral }]}>{Number(m.referralCount) || 0}명</Text>
                  <Text style={styles.staffStatL}>초대한 친구</Text>
                </View>
              </View>
            ) : null}

            <Text style={styles.sLabel}>회원 정보</Text>
            <View style={styles.card}>
              {isCorp ? (
                <>
                  <DetailRow icon="business-outline" label="상호" value={m.companyName || '-'} />
                  <DetailRow icon="document-outline" label="사업자" value={m.bizNo || '-'} />
                  <DetailRow icon="pricetag-outline" label="업종" value={m.industry || '-'} />
                  <DetailRow icon="person-outline" label="담당자" value={m.managerName || '-'} />
                  <DetailRow icon="call-outline" label="연락처" value={m.managerContact || '-'} />
                  <DetailRow icon="mail-outline" label="이메일" value={m.managerEmail || '-'} />
                  <DetailRow icon="storefront-outline" label="연결매장" value={m.linkedStoreName || '미연결'} last />
                </>
              ) : (
                <>
                  <DetailRow icon="at-outline" label="아이디" value={m.handle || '-'} />
                  <DetailRow icon="log-in-outline" label="가입경로" value={joinPathOf(m)} />
                  <DetailRow icon="mail-outline" label="이메일" value={m.email || '-'} />
                  <DetailRow icon="gift-outline" label="초대코드" value={m.referralCode || m.handle || '-'} />
                  <DetailRow icon="calendar-outline" label="가입일" value={m.joinedAt || '-'} last />
                </>
              )}
            </View>

            {isCorp ? (
              <>
                <Text style={styles.sLabel}>매장주 로그인 계정</Text>
                <View style={styles.acctCard}>
                  <Ionicons name="key" size={18} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.acctId}>@{m.loginId || '미발급'}</Text>
                    <Text style={styles.muted}>비밀번호 {m.password || '-'}</Text>
                  </View>
                </View>
              </>
            ) : null}

            <TouchableOpacity style={[styles.acctBtn, { marginTop: spacing.lg }]} onPress={onAdjust}>
              <Ionicons name="diamond" size={16} color={colors.white} />
              <Text style={styles.acctBtnText}>PB 지급 / 회수</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.ckDelete} onPress={() => onDelete(m.id)}>
              <Ionicons name="trash-outline" size={15} color={colors.danger} />
              <Text style={styles.ckDeleteText}>이 회원 삭제</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Portal>
  );
}

// 회원 추가/수정 — 유형(일반/기업)에 따라 다른 필드.
function MemberModal({
  member,
  activeStores,
  onClose,
  onSave,
  onDelete,
}: {
  member: any;
  activeStores: any[];
  onClose: () => void;
  onSave: (item: any) => void;
  onDelete: (id: string) => void;
}) {
  const [f, setF] = useState<any>({ status: 'active', ...member });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const isCorp = f.memberType === '기업';
  const pickStore = (s: any | null) => {
    if (!s) {
      setF((p: any) => ({ ...p, linkedStoreId: '', linkedStoreName: '' }));
      return;
    }
    setF((p: any) => ({
      ...p,
      linkedStoreId: s.id || '',
      linkedStoreName: s.storeName || '',
      // 매장 정보로 비어있는 담당자/업종/상호 자동 채움
      managerName: p.managerName || s.ownerName || '',
      managerContact: p.managerContact || s.contact || '',
      industry: p.industry || s.category || '',
      companyName: p.companyName || s.storeName || '',
    }));
  };

  const title = f.id
    ? isCorp
      ? f.companyName || f.name || '기업 회원'
      : f.name || '회원'
    : isCorp
      ? '기업 회원 추가'
      : '일반 회원 추가';

  return (
    <Modal title={title} onClose={onClose} size={isCorp ? 'wide' : undefined}>
      {isCorp ? (
        <>
          <StorePicker stores={activeStores} valueName={f.linkedStoreName} onPick={pickStore} />
          <Text style={[styles.muted, { marginTop: -spacing.sm, marginBottom: spacing.md }]}>
            연결할 버닝 매장을 먼저 선택하면 상호·담당자·업종이 자동으로 채워져요.
          </Text>
          <FormField label="상호 / 회사명 *" value={String(f.companyName ?? '')} onChange={(v) => set('companyName', v)} />
          <View style={styles.formRow}>
            <View style={{ flex: 1 }}>
              <FormField label="사업자등록번호" value={String(f.bizNo ?? '')} onChange={(v) => set('bizNo', v)} placeholder="123-45-67890" />
            </View>
            <View style={{ flex: 1 }}>
              <FormField label="업종" value={String(f.industry ?? '')} onChange={(v) => set('industry', v)} />
            </View>
          </View>
          <View style={styles.formRow}>
            <View style={{ flex: 1 }}>
              <FormField label="담당자" value={String(f.managerName ?? '')} onChange={(v) => set('managerName', v)} />
            </View>
            <View style={{ flex: 1 }}>
              <FormField label="담당자 연락처" value={String(f.managerContact ?? '')} onChange={(v) => set('managerContact', v)} />
            </View>
          </View>
          <FormField label="담당자 이메일" value={String(f.managerEmail ?? '')} onChange={(v) => set('managerEmail', v)} />

          <Text style={styles.fLabel}>로그인 ID</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
            <TextInput
              style={[styles.fInput, { flex: 1, marginBottom: 0 }]}
              value={String(f.loginId ?? '')}
              onChangeText={(v) => set('loginId', v)}
              placeholder="store_xxxx"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.genBtn} onPress={() => set('loginId', genLoginId(f.companyName))}>
              <Text style={styles.genBtnText}>생성</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.formRow}>
            <View style={{ flex: 1.4 }}>
              <Text style={styles.fLabel}>비밀번호</Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <TextInput
                  style={[styles.fInput, { flex: 1, marginBottom: 0 }]}
                  value={String(f.password ?? '')}
                  onChangeText={(v) => set('password', v)}
                  placeholder="자동 생성됨"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                />
                <TouchableOpacity style={styles.genBtn} onPress={() => set('password', genPassword())}>
                  <Text style={styles.genBtnText}>생성</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <SelectRow label="상태" value={String(f.status ?? 'active')} options={['active', 'suspended']} onChange={(v) => set('status', v)} />
            </View>
          </View>
          <Text style={styles.muted}>매장주에게 로그인 ID·비밀번호를 전달하세요. (비워두면 저장 시 자동 발급)</Text>
        </>
      ) : (
        <>
          <FormField label="이름 *" value={String(f.name ?? '')} onChange={(v) => set('name', v)} />
          <FormField label="아이디(핸들)" value={String(f.handle ?? '')} onChange={(v) => set('handle', v)} placeholder="@handle" />
          <View style={styles.formRow}>
            <View style={{ flex: 1 }}>
              <FormField label="PB" value={String(f.pb ?? 0)} onChange={(v) => set('pb', Number(v) || 0)} numeric />
            </View>
            <View style={{ flex: 1 }}>
              <SelectRow label="상태" value={String(f.status ?? 'active')} options={['active', 'suspended']} onChange={(v) => set('status', v)} />
            </View>
          </View>
          <FormField label="가입일" value={String(f.joinedAt ?? '')} onChange={(v) => set('joinedAt', v)} placeholder="2026-03-01" />
          <Text style={styles.fLabel}>초대 코드 {f.id ? `· 초대한 친구 ${Number(f.referralCount) || 0}명` : ''}</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TextInput
              style={[styles.fInput, { flex: 1, marginBottom: 0 }]}
              value={String(f.referralCode ?? '')}
              onChangeText={(v) => set('referralCode', v.toUpperCase())}
              placeholder="자동 생성됨"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="characters"
            />
            <TouchableOpacity style={styles.genBtn} onPress={() => set('referralCode', genReferralCode())}>
              <Text style={styles.genBtnText}>생성</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.muted}>친구가 이 코드(또는 @{String(f.handle || '아이디').replace(/^@/, '')})를 가입 시 입력하면 둘 다 PB를 받아요.</Text>
        </>
      )}

      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
        {f.id ? (
          <TouchableOpacity style={styles.delDealBtn} onPress={() => onDelete(f.id)}>
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={[styles.saveBtn, { flex: 1 }]} onPress={() => onSave(f)}>
          <Text style={styles.saveBtnText}>저장</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

/* =============================================================== 직원 */

// 세분화된 직무. 관리자·인사 계열은 직원 메뉴 접근 권한.
const POSITIONS = [
  '대표',
  '관리자',
  '인사',
  '재무/회계',
  '영업이사',
  '영업팀장',
  '영업사원',
  '운영매니저',
  '운영',
  '마케팅',
  '퍼포먼스마케팅',
  'CS',
  '디자이너',
  '개발',
  '기타',
];

// 재사용 드롭다운 선택창 (직무·담당자 등). searchable 옵션.
function Dropdown({
  label,
  value,
  options,
  onChange,
  placeholder,
  searchable,
}: {
  label?: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list =
    searchable && q.trim()
      ? options.filter((o) => o.toLowerCase().includes(q.trim().toLowerCase()))
      : options;
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Text style={styles.fLabel}>{label}</Text> : null}
      <TouchableOpacity style={styles.pickerBtn} onPress={() => setOpen((o) => !o)} activeOpacity={0.8}>
        <Text style={[styles.pickerBtnText, !value && { color: colors.textTertiary }]} numberOfLines={1}>
          {value || placeholder || '선택'}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textTertiary} />
      </TouchableOpacity>
      {open ? (
        <View style={styles.pickerPanel}>
          {searchable ? (
            <View style={[styles.searchBar, { marginBottom: 0, borderRadius: 0 }]}>
              <Ionicons name="search" size={15} color={colors.textTertiary} />
              <TextInput
                style={styles.searchInput}
                value={q}
                onChangeText={setQ}
                placeholder="검색"
                placeholderTextColor={colors.textTertiary}
                autoFocus
              />
            </View>
          ) : null}
          <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {list.map((o) => (
              <TouchableOpacity
                key={o}
                style={styles.pickRow}
                onPress={() => {
                  onChange(o);
                  setOpen(false);
                  setQ('');
                }}
              >
                <Text style={[styles.pickRowText, value === o && { color: colors.primary }]}>{o}</Text>
              </TouchableOpacity>
            ))}
            {list.length === 0 ? (
              <Text style={[styles.muted, { padding: spacing.md }]}>결과가 없어요.</Text>
            ) : null}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function StaffSection() {
  const [staff, setStaff] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const [detail, setDetail] = useState<any | null>(null);

  const refresh = async () => {
    try {
      const [st, s] = await Promise.all([
        api('data?c=staff').then((r) => r.json()),
        api('data?c=stores').then((r) => r.json()),
      ]);
      setStaff(Array.isArray(st.items) ? st.items : []);
      setStores(Array.isArray(s.items) ? s.items : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
  }, []);

  const thisMonth = todayStr().slice(0, 7);
  const metrics = (name: string) => {
    const mine = stores.filter((s) => s.salesRep === name);
    const openDeals = mine.filter((s) => OPEN_STAGES.includes(s.stage)).length;
    const active = mine.filter((s) => s.stage === '활성').length;
    const newThisMonth = mine.filter(
      (s) => s.stage === '활성' && s.contractDate && String(s.contractDate).slice(0, 7) === thisMonth
    ).length;
    return { openDeals, active, newThisMonth, newMrr: newThisMonth * BURNING_MONTHLY_FEE };
  };

  const working = staff.filter((s) => s.status !== '퇴사');
  const payroll = working.reduce((s, m) => s + (Number(m.salary) || 0), 0);
  const monthNewTotal = staff.reduce((s, m) => s + metrics(m.name).newThisMonth, 0);

  const list = q.trim()
    ? staff.filter((m) => JSON.stringify(Object.values(m)).toLowerCase().includes(q.trim().toLowerCase()))
    : staff;

  const save = async (item: any) => {
    const action = item.id ? 'update' : 'create';
    if (!item.loginId) item.loginId = genLoginId(item.name || 'staff');
    if (!item.password) item.password = genPassword();
    await api('data?c=staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, item }),
    });
    setEditing(null);
    toast(action === 'create' ? '직원이 추가되었습니다' : '저장되었습니다');
    refresh();
  };
  const del = async (id: string) => {
    const m = staff.find((x) => x.id === id);
    if (!confirmAction(`'${m?.name || '직원'}'을(를) 삭제할까요?`)) return;
    await api('data?c=staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    });
    toast('삭제되었습니다');
    refresh();
  };

  return (
    <View>
      <View style={styles.h1Row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>직원 관리</Text>
          <Text style={styles.sectionSub}>
            직무·급여·로그인 계정 · 담당 딜/실적. 관리자·인사 직무만 접근 가능.
          </Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setEditing({ status: '재직', position: '영업사원', joinedAt: todayStr() })}>
          <Ionicons name="person-add" size={16} color={colors.white} />
          <Text style={styles.addBtnText}>직원 추가</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.kpiRow}>
        <Kpi icon="people" label="총 직원" value={`${staff.length}`} />
        <Kpi icon="checkmark-circle" label="재직" value={`${working.length}`} />
        <Kpi icon="flame" label="이달 신규 계약" value={`${monthNewTotal}`} accent />
        <Kpi icon="card" label="월 급여 총액" value={won(payroll)} />
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          value={q}
          onChangeText={setQ}
          placeholder="이름·직무·연락처 검색"
          placeholderTextColor={colors.textTertiary}
        />
        <Text style={styles.countText}>{list.length}건</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} />
      ) : list.length === 0 ? (
        <Empty text="등록된 직원이 없어요." />
      ) : (
        <View style={styles.table}>
          {list.map((m, ri) => {
            const mt = metrics(m.name);
            return (
              <TouchableOpacity
                key={m.id}
                style={[styles.memberRow, ri === list.length - 1 && styles.rowLast]}
                activeOpacity={0.7}
                onPress={() => setDetail(m)}
              >
                <View style={[styles.mTag, styles.mTagCorp]}>
                  <Text style={[styles.mTagText, { color: colors.primary }]} numberOfLines={1}>
                    {m.position || '직무'}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName} numberOfLines={1}>{m.name || '-'}</Text>
                  <Text style={styles.memberSub} numberOfLines={1}>
                    {m.loginId ? `@${m.loginId} · ` : ''}담당 {mt.openDeals} · 활성 {mt.active} · 이달 신규 {mt.newThisMonth} · 급여 {won(Number(m.salary) || 0)}
                  </Text>
                </View>
                <Badge value={m.status || '재직'} />
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {detail ? (
        <StaffDetail
          staff={detail}
          stores={stores}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setEditing(detail);
            setDetail(null);
          }}
          onDelete={(id) => {
            setDetail(null);
            del(id);
          }}
        />
      ) : null}
      {editing ? (
        <StaffModal staff={editing} onClose={() => setEditing(null)} onSave={save} onDelete={del} />
      ) : null}
    </View>
  );
}

// 직원 상세 — 실적·담당 매장·정보·로그인 + 수정 진입.
function StaffDetail({
  staff,
  stores,
  onClose,
  onEdit,
  onDelete,
}: {
  staff: any;
  stores: any[];
  onClose: () => void;
  onEdit: () => void;
  onDelete: (id: string) => void;
}) {
  useScrollLock();
  const m = staff;
  const thisMonth = todayStr().slice(0, 7);
  const mine = stores.filter((s) => s.salesRep === m.name);
  const openDeals = mine.filter((s) => OPEN_STAGES.includes(s.stage));
  const active = mine.filter((s) => s.stage === '활성');
  const newThisMonth = active.filter(
    (s) => s.contractDate && String(s.contractDate).slice(0, 7) === thisMonth
  ).length;
  const initial = (m.name || '?').slice(0, 1);

  return (
    <Portal>
      <View style={styles.drawerOverlay}>
        <TouchableOpacity style={styles.drawerBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.drawerPanel}>
          <View style={styles.drawerHead}>
            <Text style={styles.drawerTitle} numberOfLines={1}>직원 상세</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.drawerBody} showsVerticalScrollIndicator={false}>
            {/* 프로필 헤더 */}
            <View style={styles.staffProfile}>
              <View style={styles.staffAvatar}>
                <Text style={styles.staffAvatarText}>{initial}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.staffName} numberOfLines={1}>{m.name || '-'}</Text>
                <View style={styles.staffMetaRow}>
                  <View style={styles.posPill}>
                    <Text style={styles.posPillText}>{m.position || '직무'}</Text>
                  </View>
                  <Badge value={m.status || '재직'} />
                </View>
              </View>
              <TouchableOpacity style={styles.ckEditBtn} onPress={onEdit}>
                <Ionicons name="create-outline" size={15} color={colors.primary} />
                <Text style={styles.ckEditText}>수정</Text>
              </TouchableOpacity>
            </View>

            {/* 실적 2x2 */}
            <View style={styles.staffStatGrid}>
              <View style={styles.staffStat}>
                <Text style={styles.staffStatV}>{openDeals.length}</Text>
                <Text style={styles.staffStatL}>담당 딜 (진행)</Text>
              </View>
              <View style={styles.staffStat}>
                <Text style={styles.staffStatV}>{active.length}</Text>
                <Text style={styles.staffStatL}>활성 매장</Text>
              </View>
              <View style={styles.staffStat}>
                <Text style={[styles.staffStatV, { color: colors.coral }]}>{newThisMonth}</Text>
                <Text style={styles.staffStatL}>이달 신규 계약</Text>
              </View>
              <View style={styles.staffStat}>
                <Text style={styles.staffStatV}>{won(active.length * BURNING_MONTHLY_FEE)}</Text>
                <Text style={styles.staffStatL}>활성 MRR 기여</Text>
              </View>
            </View>

            <Text style={styles.sLabel}>직원 정보</Text>
            <View style={styles.card}>
              <DetailRow icon="call-outline" label="연락처" value={m.phone || '-'} />
              <DetailRow icon="mail-outline" label="이메일" value={m.email || '-'} />
              <DetailRow icon="calendar-outline" label="입사일" value={m.joinedAt || '-'} />
              <DetailRow icon="cash-outline" label="월급" value={won(Number(m.salary) || 0)} />
              {m.memo ? <DetailRow icon="document-text-outline" label="메모" value={m.memo} last /> : null}
            </View>

            <Text style={styles.sLabel}>어드민 로그인 계정</Text>
            <View style={styles.acctCard}>
              <Ionicons name="key" size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.acctId}>@{m.loginId || '미발급'}</Text>
                <Text style={styles.muted}>비밀번호 {m.password || '-'}</Text>
              </View>
            </View>

            <Text style={styles.sLabel}>담당 매장{mine.length ? ` · ${mine.length}곳` : ''}</Text>
            {mine.length === 0 ? (
              <View style={styles.card}>
                <Text style={[styles.muted, { padding: spacing.md }]}>배정된 매장이 없어요.</Text>
              </View>
            ) : (
              <View style={styles.card}>
                {mine.map((s, i) => (
                  <View key={s.id} style={[styles.storeLine, i < mine.length - 1 && styles.storeLineBorder]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.recentName} numberOfLines={1}>{s.storeName}</Text>
                      <Text style={styles.recentMeta} numberOfLines={1}>
                        {s.region}{s.category ? ` · ${s.category}` : ''}
                      </Text>
                    </View>
                    <Badge value={s.stage} />
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity style={styles.ckDelete} onPress={() => onDelete(m.id)}>
              <Ionicons name="trash-outline" size={15} color={colors.danger} />
              <Text style={styles.ckDeleteText}>이 직원 삭제</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Portal>
  );
}

// 상세 정보 한 줄 (라벨 · 값).
function DetailRow({
  icon,
  label,
  value,
  last,
}: {
  icon: string;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.detailRow, !last && styles.storeLineBorder]}>
      <Ionicons name={icon as any} size={16} color={colors.textTertiary} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function StaffModal({
  staff,
  onClose,
  onSave,
  onDelete,
}: {
  staff: any;
  onClose: () => void;
  onSave: (item: any) => void;
  onDelete: (id: string) => void;
}) {
  const [f, setF] = useState<any>({ status: '재직', position: '영업사원', ...staff });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  return (
    <Modal title={f.id ? f.name || '직원' : '직원 추가'} onClose={onClose} size="wide">
      <FormField label="이름 *" value={String(f.name ?? '')} onChange={(v) => set('name', v)} />
      <View style={styles.formRow}>
        <View style={{ flex: 1 }}>
          <Dropdown
            label="직무"
            value={String(f.position ?? '')}
            options={POSITIONS}
            onChange={(v) => set('position', v)}
            placeholder="직무 선택"
            searchable
          />
        </View>
        <View style={{ flex: 1 }}>
          <Dropdown
            label="상태"
            value={String(f.status ?? '재직')}
            options={['재직', '퇴사']}
            onChange={(v) => set('status', v)}
          />
        </View>
      </View>
      <View style={styles.formRow}>
        <View style={{ flex: 1 }}>
          <FormField label="연락처" value={String(f.phone ?? '')} onChange={(v) => set('phone', v)} />
        </View>
        <View style={{ flex: 1 }}>
          <FormField label="이메일" value={String(f.email ?? '')} onChange={(v) => set('email', v)} />
        </View>
      </View>
      <View style={styles.formRow}>
        <View style={{ flex: 1 }}>
          <FormField label="월급 (원)" value={String(f.salary ?? '')} onChange={(v) => set('salary', Number(v) || 0)} numeric />
        </View>
        <View style={{ flex: 1 }}>
          <FormField label="입사일" value={String(f.joinedAt ?? '')} onChange={(v) => set('joinedAt', v)} placeholder="2026-02-01" />
        </View>
      </View>

      <Text style={styles.fLabel}>어드민 로그인 ID</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
        <TextInput
          style={[styles.fInput, { flex: 1, marginBottom: 0 }]}
          value={String(f.loginId ?? '')}
          onChangeText={(v) => set('loginId', v)}
          placeholder="자동 생성됨"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
        />
        <TouchableOpacity style={styles.genBtn} onPress={() => set('loginId', genLoginId(f.name))}>
          <Text style={styles.genBtnText}>생성</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.fLabel}>비밀번호</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
        <TextInput
          style={[styles.fInput, { flex: 1, marginBottom: 0 }]}
          value={String(f.password ?? '')}
          onChangeText={(v) => set('password', v)}
          placeholder="자동 생성됨"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
        />
        <TouchableOpacity style={styles.genBtn} onPress={() => set('password', genPassword())}>
          <Text style={styles.genBtnText}>생성</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.muted}>이 ID·비밀번호로 어드민에 로그인해요. 관리자·인사 직무만 직원 메뉴가 보여요.</Text>

      <FormField label="메모 / 기타" value={String(f.memo ?? '')} onChange={(v) => set('memo', v)} />

      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
        {f.id ? (
          <TouchableOpacity style={styles.delDealBtn} onPress={() => onDelete(f.id)}>
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={[styles.saveBtn, { flex: 1 }]} onPress={() => onSave(f)}>
          <Text style={styles.saveBtnText}>저장</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// PB 지급/회수/보정 → 원장 기록 + 잔액 반영 (POST /api/admin/pb).
function PbAdjustModal({
  member,
  onClose,
  onDone,
}: {
  member: any;
  onClose: () => void;
  onDone: () => void;
}) {
  const [type, setType] = useState('issue');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const cur = Number(member.pb) || 0;
  const amt = Number(amount) || 0;
  const preview =
    type === 'issue' || type === 'adjust' ? cur + amt : Math.max(0, cur - amt);
  const curLabel = PB_TYPE_OPTS.find((o) => o.v === type)?.l || PB_TYPE_OPTS[0].l;
  const submit = async () => {
    if (!amt) {
      setErr('금액을 입력하세요');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const r = await api('data?c=pb_events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'grant',
          memberId: member.id,
          memberName: member.name,
          type,
          amount: amt,
          reason,
        }),
      });
      const d = await r.json();
      if (d.ok) {
        toast(`${member.name} PB ${PB_TYPE_LABEL[type] || ''} ${amt} 반영`);
        onDone();
      } else setErr(d.error === 'store_not_connected' ? '저장소 미연결' : '처리 실패');
    } catch {
      setErr('처리 실패');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title={`PB 조정 · ${member.name}`} onClose={onClose}>
      <View style={styles.card}>
        <View style={styles.pbRow}>
          <Text style={styles.pbLabel}>현재 잔액</Text>
          <Text style={styles.pbVal}>{cur} PB</Text>
        </View>
        <View style={styles.pbRow}>
          <Text style={styles.pbLabel}>조정 후 (예상)</Text>
          <Text style={[styles.pbVal, { color: colors.primary }]}>{preview} PB</Text>
        </View>
      </View>
      <SelectRow
        label="유형"
        value={curLabel}
        options={PB_TYPE_OPTS.map((o) => o.l)}
        onChange={(l) => setType(PB_TYPE_OPTS.find((o) => o.l === l)?.v || 'issue')}
      />
      <Text style={styles.muted}>
        발행 리뷰·이벤트 지급 · 사용 응모 차감 · 회수 허위리뷰 환수 · 보정 부호 그대로 반영
      </Text>
      <FormField label="금액 (PB)" value={amount} onChange={setAmount} numeric placeholder="예: 10" />
      <FormField label="사유" value={reason} onChange={setReason} placeholder="예: 이벤트 보상 / 허위리뷰 환수" />
      {err ? <Text style={styles.errBanner}>⚠ {err}</Text> : null}
      <TouchableOpacity
        style={[styles.saveBtn, saving && { opacity: 0.6 }]}
        onPress={submit}
        disabled={saving}
      >
        <Text style={styles.saveBtnText}>{saving ? '처리 중…' : '적용'}</Text>
      </TouchableOpacity>
    </Modal>
  );
}

// PB 원장 — 발행·사용·회수 이벤트 조회 + 회원 잔액 정합 검증.
function PbLedgerView() {
  const [events, setEvents] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  useEffect(() => {
    Promise.all([
      api('data?c=pb_events').then((r) => r.json()).then((d) => setEvents(d.items || [])),
      api('data?c=members').then((r) => r.json()).then((d) => setMembers(d.items || [])),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const sumType = (t: string) =>
    events.filter((e) => e.type === t).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const issued = sumType('issue');
  const spent = sumType('spend');
  const reclaimed = sumType('reclaim');
  const adjusted = events
    .filter((e) => e.type === 'adjust')
    .reduce((s, e) => s + (Number(e.signed) ?? Number(e.amount) ?? 0), 0);
  const netLedger = issued - spent - reclaimed + adjusted;
  const memberTotal = members.reduce((s, m) => s + (Number(m.pb) || 0), 0);
  const reconciled = netLedger === memberTotal;

  const shown = q.trim()
    ? events.filter((e) =>
        JSON.stringify(Object.values(e)).toLowerCase().includes(q.trim().toLowerCase())
      )
    : events;

  return (
    <View>
      <SectionTitle
        title="PB 원장"
        sub="발행 → 사용 → 회수 전 이력. 유통 PB(부채)와 회원 잔액을 정합 검증."
      />
      <View style={styles.kpiRow}>
        <Kpi icon="add-circle" label="총 발행" value={`${issued} PB`} />
        <Kpi icon="remove-circle" label="총 사용" value={`${spent} PB`} accent />
        <Kpi icon="refresh-circle" label="총 회수" value={`${reclaimed} PB`} accent />
        <Kpi icon="diamond" label="유통 PB (부채)" value={`${memberTotal} PB`} />
      </View>

      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>정합성 검증</Text>
          <View
            style={[
              styles.reconBadge,
              { backgroundColor: reconciled ? colors.primarySoft : colors.coralSoft },
            ]}
          >
            <Text
              style={[styles.reconText, { color: reconciled ? colors.primary : colors.coral }]}
            >
              {reconciled ? '✓ 정합' : '⚠ 불일치'}
            </Text>
          </View>
        </View>
        <View style={styles.pbRow}>
          <Text style={styles.pbLabel}>원장 순증 (발행−사용−회수±보정)</Text>
          <Text style={styles.pbVal}>{netLedger} PB</Text>
        </View>
        <View style={styles.pbRow}>
          <Text style={styles.pbLabel}>회원 잔액 합계</Text>
          <Text style={styles.pbVal}>{memberTotal} PB</Text>
        </View>
        {!reconciled ? (
          <Text style={styles.muted}>
            차이 {netLedger - memberTotal} PB — 원장을 거치지 않은 잔액 변경이 있어요.
          </Text>
        ) : null}
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          value={q}
          onChangeText={setQ}
          placeholder="회원·사유 검색"
          placeholderTextColor={colors.textTertiary}
        />
        <Text style={styles.countText}>{shown.length}건</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} />
      ) : shown.length === 0 ? (
        <Empty text="PB 이벤트가 없어요." />
      ) : (
        <View style={styles.table}>
          <View style={[styles.tr, styles.trHead]}>
            <Text style={[styles.th, { width: 92 }]}>날짜</Text>
            <Text style={[styles.th, { flex: 1.2 }]}>회원</Text>
            <Text style={[styles.th, { width: 64 }]}>유형</Text>
            <Text style={[styles.th, { width: 72, textAlign: 'right' }]}>증감</Text>
            <Text style={[styles.th, { width: 72, textAlign: 'right' }]}>잔액</Text>
            <Text style={[styles.th, { flex: 1.4 }]}>사유</Text>
          </View>
          {shown.map((e) => {
            const signed = Number(e.signed) ?? 0;
            const up = signed >= 0;
            return (
              <View key={e.id} style={styles.tr}>
                <Text style={[styles.td, { width: 92 }]}>{e.date || '-'}</Text>
                <Text style={[styles.td, { flex: 1.2 }]} numberOfLines={1}>
                  {e.memberName || e.memberId}
                </Text>
                <Text style={[styles.td, { width: 64 }]}>{PB_TYPE_LABEL[e.type] || e.type}</Text>
                <Text
                  style={[
                    styles.td,
                    { width: 72, textAlign: 'right', color: up ? colors.primary : colors.coral, fontWeight: '800' },
                  ]}
                >
                  {up ? '+' : ''}
                  {signed}
                </Text>
                <Text style={[styles.td, { width: 72, textAlign: 'right' }]}>{e.balanceAfter ?? '-'}</Text>
                <Text style={[styles.td, { flex: 1.4 }]} numberOfLines={1}>
                  {e.reason || '-'}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

/* ==================================================== generic collection */

/* 표의 열 폭·정렬 규칙.
   전부 같은 폭(flex 1.5)을 주면 이름 열은 잘리고 상태·숫자 열은 공간이 남아
   표 전체가 어긋나 보인다. 열의 성격에 따라 폭과 정렬을 다르게 준다. */
const NUMERIC_COLS = new Set([
  'pb', 'price', 'pbCost', 'stock', 'winners', 'stores', 'feePerStore', 'reqPb', 'pbClaw', 'amount',
]);
const FIXED_COLS: Record<string, number> = { image: 56, status: 96 };
const WIDE_COLS = new Set(['name', 'title', 'target', 'product', 'storeName', 'address']);

function colStyle(key: string): any {
  if (FIXED_COLS[key]) return { width: FIXED_COLS[key] };
  if (NUMERIC_COLS.has(key)) return { flex: 1 };
  if (WIDE_COLS.has(key)) return { flex: 2.2 };
  return { flex: 1.4 };
}

function CollectionManager({
  collection,
  title,
  fields,
  columns,
  addLabel,
  extraAction,
}: {
  collection: string;
  title: string;
  fields: Field[];
  columns: string[];
  addLabel: string;
  extraAction?: { icon: string; onPress: (item: any) => void };
}) {
  const PAGE = 25;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState<any | null>(null); // {} for new
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [q, collection]);
  const labelOf = useMemo(() => {
    const m: Record<string, string> = {};
    fields.forEach((f) => (m[f.key] = f.label));
    return m;
  }, [fields]);

  const refresh = async () => {
    try {
      const r = await api(`data?c=${collection}`);
      const d = await r.json();
      setErr(d.persisted === false ? '저장소 미연결' : '');
      setItems(Array.isArray(d.items) ? d.items : []);
    } catch {
      setErr('불러오기 실패');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection]);

  const save = async (item: any) => {
    const numericKeys = fields.filter((f) => f.type === 'number').map((f) => f.key);
    const clean = { ...item };
    numericKeys.forEach((k) => (clean[k] = Number(clean[k]) || 0));
    const action = item.id ? 'update' : 'create';
    await api(`data?c=${collection}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, item: clean }),
    });
    setEditing(null);
    toast(action === 'create' ? '추가되었습니다' : '저장되었습니다');
    refresh();
  };
  const del = async (id: string) => {
    const item = items.find((it) => it.id === id);
    const name = item?.name || item?.title || item?.storeName || '항목';
    if (!confirmAction(`'${name}'을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return;
    await api(`data?c=${collection}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    });
    toast('삭제되었습니다');
    refresh();
  };

  const fmtCell = (key: string, v: any) => {
    if (v == null || v === '') return '-';
    if (['price', 'pbCost', 'amount'].includes(key)) return won(Number(v) || 0);
    return String(v);
  };

  const shown = q.trim()
    ? items.filter((it) =>
        JSON.stringify(Object.values(it)).toLowerCase().includes(q.trim().toLowerCase())
      )
    : items;
  const paged = shown.slice(0, page * PAGE);

  return (
    <View>
      <View style={styles.h1Row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>{title}</Text>
          {COLLECTION_SUB[collection] ? (
            <Text style={styles.sectionSub}>{COLLECTION_SUB[collection]}</Text>
          ) : null}
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setEditing({})}>
          <Ionicons name="add" size={18} color={colors.white} />
          <Text style={styles.addBtnText}>{addLabel}</Text>
        </TouchableOpacity>
      </View>

      {err ? <Text style={styles.errBanner}>⚠ {err} — 저장소 미연결 시 저장은 안 되고 시드 데이터만 보여요.</Text> : null}

      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          value={q}
          onChangeText={setQ}
          placeholder="검색"
          placeholderTextColor={colors.textTertiary}
        />
        <Text style={styles.countText}>{shown.length}건</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} />
      ) : shown.length === 0 ? (
        <Empty text={q ? '검색 결과가 없어요.' : '등록된 항목이 없어요.'} />
      ) : (
        <View style={styles.table}>
          <View style={[styles.tr, styles.trHead]}>
            {columns.map((c) => (
              <Text
                key={c}
                style={[styles.th, colStyle(c), NUMERIC_COLS.has(c) && styles.tNum]}
                numberOfLines={1}
              >
                {labelOf[c] || c}
              </Text>
            ))}
            <Text style={[styles.th, { width: extraAction ? 116 : 84, textAlign: 'right' }]}>관리</Text>
          </View>
          {paged.map((it, ri) => (
            <View key={it.id} style={[styles.tr, ri === paged.length - 1 && styles.rowLast]}>
              {columns.map((c, i) =>
                c === 'image' ? (
                  <View key={c} style={colStyle(c)}>
                    {it[c] ? (
                      <Image source={{ uri: it[c] }} style={styles.thumb} resizeMode="cover" />
                    ) : (
                      <View style={[styles.thumb, styles.thumbEmpty]}>
                        <Ionicons name="image-outline" size={16} color={colors.textTertiary} />
                      </View>
                    )}
                  </View>
                ) : c === 'status' ? (
                  <View key={c} style={colStyle(c)}>
                    <Badge value={String(it[c] ?? '')} />
                  </View>
                ) : (
                  <Text
                    key={c}
                    style={[
                      styles.td,
                      i === 0 && styles.tdStrong,
                      colStyle(c),
                      NUMERIC_COLS.has(c) && styles.tNum,
                    ]}
                    numberOfLines={1}
                  >
                    {fmtCell(c, it[c])}
                  </Text>
                )
              )}
              <View style={{ width: extraAction ? 116 : 84, flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md }}>
                {extraAction ? (
                  <TouchableOpacity onPress={() => extraAction.onPress(it)}>
                    <Ionicons name={extraAction.icon as any} size={18} color={colors.coral} />
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity onPress={() => setEditing(it)}>
                  <Ionicons name="create-outline" size={18} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => del(it.id)}>
                  <Ionicons name="trash-outline" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {paged.length < shown.length ? (
        <TouchableOpacity style={styles.pageBtn} onPress={() => setPage((p) => p + 1)}>
          <Text style={styles.pageBtnText}>더 보기 ({paged.length}/{shown.length})</Text>
        </TouchableOpacity>
      ) : null}

      {editing && (
        <EditModal
          title={editing.id ? `${title} 수정` : addLabel}
          fields={fields}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
    </View>
  );
}

function StatusText({ value }: { value: string }) {
  const good = ['active', '완료', '발송'].includes(value);
  const warn = ['pending', '준비', 'suspended', 'inactive', 'ended'].includes(value);
  return (
    <Text
      style={{
        color: good ? colors.primary : warn ? colors.coral : colors.textSecondary,
        fontWeight: '800',
        fontSize: 12,
      }}
    >
      {value || '-'}
    </Text>
  );
}

function EditModal({
  title,
  fields,
  initial,
  onClose,
  onSave,
}: {
  title: string;
  fields: Field[];
  initial: any;
  onClose: () => void;
  onSave: (item: any) => void;
}) {
  const [form, setForm] = useState<any>(() => {
    const f: any = { ...initial };
    fields.forEach((fl) => {
      if (f[fl.key] == null) f[fl.key] = fl.type === 'select' ? fl.options?.[0] ?? '' : '';
    });
    return f;
  });
  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  return (
    <Modal onClose={onClose} title={title}>
      {fields.map((fl) =>
        fl.type === 'select' ? (
          <SelectRow
            key={fl.key}
            label={fl.label}
            value={String(form[fl.key] ?? '')}
            options={fl.options || []}
            onChange={(v) => set(fl.key, v)}
          />
        ) : fl.type === 'image' ? (
          <ImageField
            key={fl.key}
            label={fl.label}
            value={String(form[fl.key] ?? '')}
            onChange={(v) => set(fl.key, v)}
          />
        ) : (
          <FormField
            key={fl.key}
            label={fl.label}
            value={String(form[fl.key] ?? '')}
            onChange={(v) => set(fl.key, v)}
            numeric={fl.type === 'number'}
          />
        )
      )}
      <TouchableOpacity style={styles.saveBtn} onPress={() => onSave(form)}>
        <Text style={styles.saveBtnText}>저장</Text>
      </TouchableOpacity>
    </Modal>
  );
}

/* ================================================================= shared */

function Modal({
  title,
  onClose,
  children,
  size,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'default' | 'wide';
}) {
  useScrollLock();
  const wide = size === 'wide';
  return (
    <Portal>
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.modalCard, wide && styles.modalCardWide]}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {/* 고정 460px 은 화면이 크면 답답하고 작으면 넘친다. 뷰포트 비율로 맞춘다. */}
          <ScrollView style={{ maxHeight: (wide ? '82vh' : '72vh') as any }} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Portal>
  );
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  numeric,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  numeric?: boolean;
}) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.fLabel}>{label}</Text>
      <TextInput
        style={styles.fInput}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        keyboardType={numeric ? 'numeric' : 'default'}
      />
    </View>
  );
}

function ImageField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const pick = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        alert('사진 접근 권한이 필요합니다.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.5,
        base64: true,
        allowsMultipleSelection: false,
      });
      if (res.canceled) return;
      const a: any = res.assets[0];
      const mime = a.mimeType || 'image/jpeg';
      const dataUrl = a.base64 ? `data:${mime};base64,${a.base64}` : a.uri;
      setBusy(true);
      const r = await api('upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
      });
      const d = await r.json();
      if (d.url) onChange(d.url);
      else alert('이미지 업로드 실패 (저장소 확인)');
    } catch {
      alert('이미지 업로드 오류');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.fLabel}>{label}</Text>
      <TouchableOpacity style={styles.imgPick} onPress={pick} activeOpacity={0.85} disabled={busy}>
        {value ? (
          <Image source={{ uri: value }} style={styles.imgPreview} resizeMode="cover" />
        ) : (
          <View style={styles.imgPlaceholder}>
            <Ionicons name="image-outline" size={26} color={colors.textTertiary} />
            <Text style={styles.muted}>{busy ? '업로드 중…' : '사진 선택'}</Text>
          </View>
        )}
      </TouchableOpacity>
      {value && !busy ? (
        <Text style={[styles.linkText, { marginTop: 6 }]} onPress={pick}>
          다른 사진 선택
        </Text>
      ) : null}
    </View>
  );
}

function SelectRow({
  label,
  value,
  options,
  onChange,
  display,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  display?: (v: string) => string;
}) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.fLabel}>{label}</Text>
      <View style={styles.chipRow}>
        {options.map((o) => (
          <TouchableOpacity
            key={o}
            style={[styles.chip, value === o && styles.chipOn]}
            onPress={() => onChange(o)}
          >
            <Text style={[styles.chipText, value === o && styles.chipTextOn]}>
              {display ? display(o) : o}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name="file-tray-outline" size={22} color={colors.textTertiary} />
      </View>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

/* ================================================================= styles */

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    minHeight: '100%' as any,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  logo: { fontSize: 22, fontWeight: '900', color: colors.primary, letterSpacing: 0.5 },
  logoDot: { color: colors.coral },
  logoAdmin: { fontSize: 14, fontWeight: '800', color: colors.textSecondary },

  loginWrap: {
    flex: 1,
    minHeight: '100%' as any,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  loginCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing['2xl'],
    ...shadow.card,
  },
  loginSub: { ...type.body, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.lg },
  label: { ...type.label, color: colors.textPrimary, marginTop: spacing.md, marginBottom: spacing.xs },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    fontSize: 15,
    color: colors.textPrimary,
    ...({ outlineStyle: 'none' } as object),
  },
  error: { color: colors.danger, fontWeight: '700', fontSize: 13, marginTop: spacing.md },
  loginBtn: {
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  loginBtnText: { color: colors.white, fontSize: 16, fontWeight: '800' },

  /* console */
  consoleRoot: { flex: 1, minHeight: '100%' as any, flexDirection: 'row', backgroundColor: colors.surface },
  sidebar: {
    width: 232,
    backgroundColor: '#141824',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  sideLogo: { paddingHorizontal: spacing.md, marginBottom: spacing.lg },
  sideKicker: {
    ...type.badge,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    borderRadius: radius.md,
    marginBottom: 2,
  },
  navItemActive: { backgroundColor: 'rgba(255,255,255,0.1)' },
  navLabel: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },
  navLabelActive: { color: '#FFFFFF', fontWeight: '800' },

  mainCol: { flex: 1 },
  topbar: {
    height: 60,
    justifyContent: 'center',
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  // 본문(contentInner)과 동일한 maxWidth·paddingHorizontal — 좌측 기준선을 공유한다.
  topbarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: CONTENT_MAX,
    alignSelf: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  topbarInnerMobile: { paddingHorizontal: spacing.md },
  topbarTitle: { ...type.title, color: colors.textPrimary },
  topbarLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1, minWidth: 0 as any },
  hamburger: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  mobileNav: {
    position: 'fixed' as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    zIndex: 40,
  },
  mobileNavPanel: { height: '100%' as any, ...shadow.lifted },
  mobileNavBackdrop: { flex: 1, backgroundColor: 'rgba(10,12,20,0.45)' },
  contentInnerMobile: { padding: spacing.md, maxWidth: '100%' as any },
  adminChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  adminAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminAvatarText: { color: colors.white, fontWeight: '900', fontSize: 14 },
  adminChipText: { ...type.label, color: colors.textSecondary },

  contentPane: { flex: 1 },
  contentInner: { padding: spacing['2xl'], maxWidth: CONTENT_MAX, width: '100%', alignSelf: 'center' },

  kpiIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },

  dashRow: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap', marginBottom: spacing.lg },
  dashCardLg: {
    flexGrow: 1,
    flexBasis: 420,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.soft,
  },
  dashCardSm: {
    flexGrow: 1,
    flexBasis: 260,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.soft,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  cardTitle: { ...type.label, color: colors.textPrimary, marginBottom: spacing.sm },
  cardBig: { fontSize: 18, fontWeight: '900', color: colors.primary },
  muted: { ...type.body, color: colors.textTertiary, marginTop: spacing.sm },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  recentName: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  recentMeta: { fontSize: 12, fontWeight: '600', color: colors.textTertiary, marginTop: 1 },

  sectionSub: { ...type.body, color: colors.textSecondary, marginTop: 4 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadow.soft,
  },
  linkText: { ...type.label, color: colors.primary },

  flywheel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    rowGap: spacing.lg,
    marginTop: spacing.md,
  },
  // 좁은 화면에서 5개 노드가 짓눌려 글자가 잘리지 않도록 최소 폭을 준다.
  flyNode: { flexGrow: 1, flexBasis: 74, minWidth: 74, alignItems: 'center', gap: 4 },
  flyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  flyVal: { fontSize: 15, fontWeight: '900', color: colors.textPrimary },
  flyLabel: { ...type.caption, color: colors.textTertiary },

  gaugePct: { fontSize: 30, fontWeight: '900', color: colors.primary, marginVertical: spacing.sm },
  gaugeTrack: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  gaugeFill: { height: '100%', backgroundColor: colors.primary, borderRadius: radius.pill },
  gaugeLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  gaugeLegendLabel: { ...type.caption, color: colors.textTertiary },
  gaugeLegendVal: { fontSize: 13, fontWeight: '800', color: colors.textPrimary },
  // 구분선이 있는 마지막 행과 카드 하단 링크가 붙지 않도록 띄운다.
  cardLink: { marginTop: spacing.md, alignSelf: 'flex-start' },
  pbRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  pbLabel: { ...type.label, color: colors.textSecondary },
  pbVal: { fontSize: 15, fontWeight: '900', color: colors.textPrimary },

  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 150, gap: spacing.md, marginTop: spacing.sm },
  chartCol: { flex: 1, alignItems: 'center' },
  chartBarTrack: { width: '100%', height: 120, backgroundColor: colors.surface, borderRadius: radius.sm, justifyContent: 'flex-end', overflow: 'hidden' },
  chartBar: { width: '100%', backgroundColor: colors.primary, borderRadius: radius.sm },
  chartLabel: { ...type.caption, color: colors.textTertiary, marginTop: 6 },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 12, fontWeight: '800' },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    ...({ outlineStyle: 'none' } as object),
  },
  countText: { ...type.caption, color: colors.textTertiary },

  h1: { ...type.h1, color: colors.textPrimary },
  h1Row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  h2: { ...type.title, color: colors.textPrimary, marginTop: spacing['2xl'], marginBottom: spacing.md },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  addBtnText: { color: colors.white, fontWeight: '800', fontSize: 13 },
  addBtnGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
  },
  addBtnGhostText: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  csvArea: {
    minHeight: 140,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    fontSize: 13,
    color: colors.textPrimary,
    marginVertical: spacing.md,
    ...(typeof (globalThis as any).document !== 'undefined' ? { fontFamily: 'monospace' as any } : {}),
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5 },
  checkLabel: { fontSize: 14, color: colors.textSecondary },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  refreshText: { color: colors.primary, fontWeight: '800', fontSize: 13 },

  kpiRow: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap', marginBottom: spacing.lg },
  kpiCard: {
    flexGrow: 1,
    flexBasis: 170,
    // 상한이 없으면 줄바꿈된 마지막 카드 하나가 가로 전체로 늘어나 열이 깨진다.
    maxWidth: 320,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.soft,
  },
  kpiValue: { fontSize: 26, fontWeight: '900', color: colors.primary },
  kpiLabel: { ...type.label, color: colors.textSecondary, marginTop: 4 },

  revenueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.soft,
  },
  revenueLabel: { ...type.label, color: colors.textSecondary },
  revenueValue: { fontSize: 24, fontWeight: '900', color: colors.textPrimary, marginTop: 4 },
  revenueBtn: { backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  revenueBtnText: { color: colors.primary, fontWeight: '800', fontSize: 13 },

  quickRow: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  quickCard: {
    width: 150,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.soft,
  },
  quickLabel: { ...type.label, color: colors.textPrimary },

  table: { backgroundColor: colors.card, borderRadius: radius.lg, overflow: 'hidden', ...shadow.soft },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    gap: spacing.md,
  },
  trHead: { backgroundColor: colors.surface },
  // 카드 안 마지막 행의 밑줄은 카드 테두리와 겹쳐 선이 하나 떠 보인다.
  rowLast: { borderBottomWidth: 0 },
  th: { ...type.caption, color: colors.textSecondary },
  td: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  tdStrong: { color: colors.textPrimary, fontWeight: '800' },
  // 숫자는 오른쪽 정렬 + 고정폭 숫자여야 자릿수가 세로로 맞는다.
  tNum: {
    textAlign: 'right',
    ...({ fontVariantNumeric: 'tabular-nums' } as object),
  },
  reconBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  reconText: { fontSize: 12, fontWeight: '800' },
  toastWrap: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.xl,
    zIndex: 9999,
    gap: spacing.sm,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#141824',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    ...shadow.card,
  },
  toastErr: { backgroundColor: colors.coral },
  toastText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  auditRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  auditDot: { width: 7, height: 7, borderRadius: 4 },
  auditText: { flex: 1, fontSize: 13, color: colors.textSecondary },
  auditWhen: { fontSize: 12, color: colors.textTertiary },
  pageBtn: {
    alignSelf: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  pageBtnText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  invBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  invBtnText: { fontSize: 12, fontWeight: '800', color: colors.primary },
  naverCard: {
    backgroundColor: '#F0FBF3',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#B7E7C4',
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  naverTitle: { fontSize: 15, fontWeight: '900', color: '#12833A', marginBottom: 2 },
  naverBtn: {
    backgroundColor: '#03C75A',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  naverBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 6 },
  naverThumb: { width: 92, height: 92, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  naverThumbOn: { borderWidth: 3, borderColor: '#03C75A' },
  coverTag: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: '#03C75A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  coverTagText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  ckPhotoWrap: { position: 'relative' },
  photoDel: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(20,24,36,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAdd: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAddText: { fontSize: 11, fontWeight: '800', color: colors.primary, marginTop: 2 },
  prodThumb: { width: 52, height: 52, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  prodHero: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  prodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  prodTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'space-between' },
  prodMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 5 },
  prodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  prodPillText: { fontSize: 12, fontWeight: '800', color: colors.primary },
  prodImgBox: {
    height: 160,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  prodImgPreview: { width: '100%', height: '100%' },
  prodImgEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  prodImgEdit: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(20,24,36,0.72)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  prodImgEditText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  cutHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.coralSoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    marginTop: -4,
  },
  cutHintText: { fontSize: 12, fontWeight: '700', color: colors.coral, flex: 1 },
  photoHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  photoMoveRow: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    right: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  photoMove: {
    width: 22,
    height: 20,
    borderRadius: 5,
    backgroundColor: 'rgba(20,24,36,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  menuName: { flex: 1, marginBottom: 0 },
  menuPrice: { width: 96, marginBottom: 0, textAlign: 'right' },
  menuDel: { padding: 4 },
  menuAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    marginTop: 2,
  },
  menuAddText: { fontSize: 13, fontWeight: '800', color: colors.primary },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  mTag: { width: 40, alignItems: 'center', paddingVertical: 3, borderRadius: radius.sm },
  mTagCorp: { backgroundColor: colors.primarySoft },
  mTagUser: { backgroundColor: colors.surfaceAlt },
  mTagText: { fontSize: 11, fontWeight: '800' },
  memberName: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  memberSub: { fontSize: 12, color: colors.textTertiary, fontWeight: '600', marginTop: 1 },
  memberActs: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  genBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  genBtnText: { color: colors.white, fontWeight: '800', fontSize: 13 },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  pickerBtnText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  pickerPanel: {
    borderWidth: 1,
    borderColor: colors.line,
    borderTopWidth: 0,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
    overflow: 'hidden',
  },
  pickRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  pickRowText: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  pickRowSub: { fontSize: 12, color: colors.textTertiary, marginTop: 1 },
  acctCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  acctId: { fontSize: 15, fontWeight: '900', color: colors.primary },
  acctBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  acctBtnText: { color: colors.white, fontWeight: '800', fontSize: 14 },
  staffProfile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  staffAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffAvatarText: { color: colors.white, fontSize: 22, fontWeight: '900' },
  staffName: { fontSize: 20, fontWeight: '900', color: colors.textPrimary },
  staffMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  posPill: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  posPillText: { fontSize: 12, fontWeight: '800', color: colors.primary },
  staffStatGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  staffStat: {
    // width + flexGrow 를 같이 주면 칸이 들쭉날쭉해진다. flexBasis 로 통일.
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 130,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  staffStatV: { fontSize: 18, fontWeight: '900', color: colors.textPrimary },
  staffStatL: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  sLabel: { fontSize: 13, fontWeight: '800', color: colors.textSecondary, marginTop: spacing.lg, marginBottom: spacing.sm },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  detailLabel: { fontSize: 13, color: colors.textTertiary, fontWeight: '700', width: 64 },
  detailValue: { flex: 1, textAlign: 'right', fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  storeLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  storeLineBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  ckHead: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  ckEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  ckEditText: { fontSize: 13, fontWeight: '800', color: colors.primary },
  ckStatRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.sm },
  ckStat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  ckStatV: { fontSize: 15, fontWeight: '900', color: colors.textPrimary },
  ckStatL: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  ckDday: { fontSize: 13, fontWeight: '900', color: colors.primary },
  ckNext: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  ckInfoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5 },
  ckInfoText: { flex: 1, fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  ckActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  ckAct: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  ckActText: { fontSize: 12, fontWeight: '800', color: colors.primary },
  ckDelete: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
  ckDeleteText: { fontSize: 13, fontWeight: '700', color: colors.danger },
  coordChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  coordText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  segRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 4,
    marginBottom: spacing.lg,
    alignSelf: 'flex-start',
  },
  segBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  segBtnOn: { backgroundColor: colors.primary },
  segText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  segTextOn: { color: colors.white },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  statusChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  statusChipOn: { backgroundColor: colors.card, borderColor: colors.primary },
  statusChipText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  statusChipTextOn: { color: colors.primary },
  storeGroup: { marginBottom: spacing['2xl'] },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  groupTitle: { fontSize: 16, fontWeight: '900', color: colors.textPrimary },
  groupMeta: { fontSize: 13, fontWeight: '700', color: colors.textTertiary },
  funRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  funLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 64 },
  funLabel: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  funTrack: { flex: 1, height: 22, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, overflow: 'hidden' },
  funFill: { height: '100%', borderRadius: radius.sm, minWidth: 2 },
  funCount: { width: 44, textAlign: 'right', fontSize: 13, fontWeight: '800', color: colors.textPrimary },
  funConv: { width: 44, textAlign: 'right', fontSize: 12, fontWeight: '700', color: colors.textTertiary },

  errBanner: {
    backgroundColor: colors.coralSoft,
    color: colors.coralDeep,
    fontWeight: '700',
    fontSize: 13,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  empty: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: spacing['3xl'],
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    ...shadow.soft,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { ...type.body, color: colors.textTertiary, fontWeight: '600' },

  appCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.soft,
  },
  appTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  appName: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  pill: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  appMeta: { fontSize: 13, color: colors.textSecondary, fontWeight: '600', marginTop: 2 },
  appNote: { fontSize: 13, color: colors.textTertiary, fontStyle: 'italic', marginTop: 4 },
  appActions: { flexDirection: 'row', gap: spacing.sm },
  approveBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.primary },
  approveText: { color: colors.white, fontWeight: '800', fontSize: 14 },
  rejectBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  rejectText: { color: colors.textSecondary, fontWeight: '800', fontSize: 14 },

  /* modal */
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    position: 'fixed' as any,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    zIndex: 50,
  },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,12,20,0.5)' },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.lifted,
  },
  modalCardWide: { maxWidth: 680, padding: spacing.xl },
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    position: 'fixed' as any,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    zIndex: 60,
  },
  drawerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,12,20,0.28)' },
  drawerPanel: {
    width: 600,
    maxWidth: '100%',
    height: '100%',
    backgroundColor: colors.card,
    ...shadow.lifted,
  },
  drawerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  drawerTitle: { ...type.title, color: colors.textPrimary, flex: 1, marginRight: spacing.md },
  drawerBody: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: 56,
  },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  modalTitle: { ...type.title, color: colors.textPrimary },
  fLabel: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.sm, marginBottom: 5 },
  fInput: {
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
    ...({ outlineStyle: 'none' } as object),
  },
  imgPick: {
    height: 150,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imgPreview: { width: '100%', height: '100%' },
  imgPlaceholder: { alignItems: 'center', gap: 4 },
  thumb: { width: 40, height: 40, borderRadius: 8, backgroundColor: colors.surfaceAlt },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  chipTextOn: { color: colors.primary },
  saveBtn: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  saveBtnText: { color: colors.white, fontWeight: '800', fontSize: 15 },

  /* sales CRM · kanban */
  kanCol: {
    width: 220,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  kanHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stageDot: { width: 8, height: 8, borderRadius: 4 },
  kanTitle: { fontSize: 14, fontWeight: '800', color: colors.textPrimary, flex: 1 },
  kanCount: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
    backgroundColor: colors.card,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  kanSum: { ...type.caption, color: colors.textTertiary, marginTop: 2, marginBottom: spacing.sm },
  dealCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.soft,
  },
  dealName: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  dealMeta: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },
  dealFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  dealRep: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  dealDate: { fontSize: 11, fontWeight: '700', color: colors.textTertiary },
  kanEmpty: { ...type.caption, color: colors.textTertiary, textAlign: 'center', paddingVertical: spacing.md },

  stageChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  stageChipText: { fontSize: 13, fontWeight: '800', color: colors.textSecondary },
  formRow: { flexDirection: 'row', gap: spacing.md },
  noteAdd: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  actDate: { fontSize: 12, fontWeight: '700', color: colors.textTertiary, width: 80 },
  actNote: { flex: 1, fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  delDealBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* P&L */
  plRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  plRowTotal: {
    borderTopWidth: 1.5,
    borderTopColor: colors.lineStrong,
    marginTop: 4,
    paddingTop: spacing.md,
  },
  plLabel: { ...type.label, color: colors.textSecondary },
  plSub: { ...type.caption, color: colors.textTertiary, marginTop: 1 },
  plValue: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
});

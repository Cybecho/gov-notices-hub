import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalUrl, kstDate, mergeNotices, validateData } from './model.mjs';

const HOST = 'notice.example.kr';
const BASE = `https://${HOST}`;
const NOW = '2026-03-01T15:00:00Z';
const LATER = '2026-03-03T10:00:00+09:00';
const source = {
  id: 'seoul', name: '서울 공지', category: 'government', itemKind: 'notice',
  allowedHosts: [HOST], role: 'candidate', status: 'active',
};
const second = { ...source, id: 'district', name: '자치구 공지', category: 'district' };
const sources = [source, second];
const empty = () => ({ updatedAt: null, items: [] });

function row(slug, publishedAt = '2026-02-01') {
  return { title: `공고 ${slug}`, url: `${BASE}/article/${slug}`, publishedAt };
}

function batch(items, sourceId = source.id) {
  return { sourceId, items };
}

function collect(items, options = {}) {
  return mergeNotices({ sources, now: NOW, batches: [batch(items)], ...options });
}

function replay(prior, batches, options = {}) {
  return mergeNotices({
    sources, now: LATER, previous: prior.notices, archives: prior.archives, batches, ...options,
  });
}

function check(result, options = {}) {
  return validateData({ notices: result.notices, archives: result.archives, sources, ...options });
}

test('원문 URL 정규화와 식별 쿼리 보존', () => {
  const raw = `http://${HOST.toUpperCase()}:80/view.do?z=2&utm_source=feed&nttId=37&a=2&a=1#top`;
  assert.equal(canonicalUrl(raw, undefined, [HOST]), `${BASE}/view.do?a=1&a=2&nttId=37&z=2`);
  assert.equal(canonicalUrl('../view.do?articleNo=7', `${BASE}/board/list.do`, [HOST]),
    `${BASE}/view.do?articleNo=7`);
  assert.equal(canonicalUrl(`//${HOST}/?id=42`, BASE, [HOST]), `${BASE}/?id=42`);
  assert.equal(canonicalUrl(`${BASE}/view.do?bbsId=42&nttId=7`), `${BASE}/view.do?bbsId=42&nttId=7`);
  assert.equal(canonicalUrl(`${BASE}/article/7?fbclid=tracking#목록`), `${BASE}/article/7`);
  assert.equal(canonicalUrl(`${BASE}/article/7`, undefined, []), null);
});

test('비공개 호스트, 인증 정보, 서명, 개인정보 및 목록 링크 거부', () => {
  for (const url of [
    'javascript:alert(1)', 'file:///etc/passwd', 'ftp://notice.example.kr/article/1',
    'https://127.1/article/1', 'https://2130706433/article/1', 'https://[::1]/article/1',
    'https://10.1.2.3/article/1', 'https://8.8.8.8/article/1', 'https://x.local/article/1',
    'https://x.localhost/article/1', 'https://intra.internal/article/1',
    `https://a:b@${HOST}/article/1`, `${BASE}:8443/article/1`,
    `${BASE}/`, `${BASE}/board/list.do?bbsId=8`, `${BASE}/download/file.pdf`,
    `${BASE}/view?access_token=abc`, `${BASE}/view?X-Amz-Signature=abc`,
    `${BASE}/view?serviceKey=abc`, `${BASE}/view?user_id=123`,
    `${BASE}/view?mail=data%40example.kr`, `${BASE}/view?value=010-1234-5678`,
    `${BASE}/view?x=%250A`, `${BASE}/view?%73ession_id=abc`,
    `${BASE}/view%0a`, `${BASE}/file.hwp`, '#top',
  ]) assert.equal(canonicalUrl(url, BASE), null, url);

  for (const host of [`sub.${HOST}`, `${HOST}.evil.kr`, `other-${HOST}`]) {
    assert.equal(canonicalUrl(`https://${host}/view?id=3`, undefined, [HOST]), null);
  }
});

test('한국 날짜는 자정, 오프셋이 있는 일시는 같은 순간의 한국 시각', () => {
  const midnight = '2024-02-29T00:00:00+09:00';
  for (const value of ['2024-02-29', '2024. 2. 29.', '2024년 2월 29일', '2024/2/29']) {
    assert.equal(kstDate(value), midnight);
  }
  assert.equal(kstDate('2026-02-28T15:00:00Z'), '2026-03-01T00:00:00+09:00');
  assert.equal(kstDate('2026-01-01T00:10:00+10:00'), '2025-12-31T23:10:00+09:00');
  assert.equal(kstDate('2026-02-28T10:00:00.125-0500'), '2026-03-01T00:00:00.125+09:00');
  for (const invalid of [
    null, '', '미정', '2026-02', '2026년 2월', '2026.2.0', '2025-02-29',
    '1900-02-29', '2026-04-31T09:00:00Z', '2026-12-01T24:00Z',
    '2026-02-01T09:00:00', '2026-02-01T09:00:00+09:60', '0000-01-01',
  ]) assert.equal(kstDate(invalid), null, String(invalid));
});

test('빈 문서와 수집 결과 0건인 출처', () => {
  const result = collect([]);
  assert.deepEqual(result.notices, empty());
  assert.deepEqual(result.archives, {});
  assert.equal(result.changed, false);
  for (const { id } of sources) {
    assert.deepEqual(result.stats.bySource[id], { seen: 0, added: 0, duplicates: 0, undated: 0 });
  }
  assert.equal(check(result), true);
});

test('같은 날짜의 ID는 입력 순서와 독립적이며 표시 동률은 안정적', () => {
  const a = row('a');
  const z = row('z');
  const first = collect([z, a]);
  const reversed = collect([a, z]);
  const ids = result => Object.fromEntries(result.notices.items.map(item => [item.url, item.id]));
  assert.deepEqual(ids(first), ids(reversed));
  assert.deepEqual(first.notices.items.map(item => item.id), [
    'seoul-20260201-002', 'seoul-20260201-001',
  ]);
  const later = replay(first, [batch([row('b')])]);
  assert.deepEqual(later.notices.items.map(item => item.title), ['공고 z', '공고 a', '공고 b']);
  assert.equal(later.notices.items[2].id, 'seoul-20260201-003');
  assert.deepEqual(Object.keys(later.notices.items[2]).sort(), [
    'category', 'department', 'fetchedAt', 'id', 'kind',
    'publishedAt', 'sourceId', 'sourceName', 'title', 'url',
  ]);
  assert.equal(later.notices.items[2].department, null);
});

test('페이지·출처·보관 문서에 반복된 원문은 최초 수집 정보 유지', () => {
  const old = row('old', '2026.1.1');
  const fresh = row('new', '2026.2.1');
  const repeated = { ...old, title: '다른 목록 제목', url: `${old.url}?utm_medium=feed#top` };
  const first = collect([], {
    cap: 1, batches: [batch([fresh, old]), batch([old]), batch([repeated], second.id)],
  });
  assert.equal(first.stats.added, 2);
  assert.equal(first.stats.duplicates, 2);
  const archived = first.archives['2026-01'].items[0];
  assert.equal(archived.sourceId, source.id);
  assert.equal(archived.title, old.title);
  assert.equal(archived.fetchedAt, '2026-03-02T00:00:00+09:00');

  const next = replay(first, [batch([repeated], second.id), batch([fresh])], { cap: 1 });
  assert.equal(next.changed, false);
  assert.equal(next.stats.duplicates, 2);
  assert.deepEqual(next.notices, first.notices);
  assert.deepEqual(next.archives, first.archives);
});

test('보관된 최대 순번을 예약하고 변경된 보관 문서만 갱신', () => {
  const first = collect([
    row('live', '2026-03-01'), row('jan', '2026-01-01'), row('feb', '2026-02-01'),
  ], { cap: 1 });
  const next = replay(first, [batch([row('feb2', '2026-02-01')])], { cap: 1 });
  assert.equal(next.changed, true);
  assert.deepEqual(next.notices, first.notices);
  assert.deepEqual(next.archives['2026-01'], first.archives['2026-01']);
  assert.equal(next.archives['2026-02'].updatedAt, LATER);
  assert.equal(next.archives['2026-02'].items[1].id, 'seoul-20260201-002');
  assert.equal(check(next, { cap: 1 }), true);
});

test('날짜 미상과 월 경계는 한국 게시일 기준으로 보관', () => {
  const result = collect([
    row('unknown', '2026년 2월'), row('missing', null),
    row('boundary', '2026-02-28T15:00:00Z'), row('newest', '2026-03-02'),
  ], { cap: 1 });
  assert.equal(result.stats.undated, 2);
  assert.equal(result.stats.bySource.seoul.undated, 2);
  assert.equal(result.archives['2026-03'].items[0].id, 'seoul-20260301-001');
  const unknown = result.archives.undated.items;
  assert.deepEqual(unknown.map(item => item.publishedAt), [null, null]);
  assert.ok(unknown.every(item => item.id.startsWith('seoul-00000000-')));
  const repeat = replay(result, [batch([row('unknown', '2026-02-01')])], { cap: 1 });
  assert.equal(repeat.changed, false);
  assert.deepEqual(repeat.archives.undated, result.archives.undated);
});

test('기존 보관 문서에 중복된 URL을 병합할 때 최초 행과 나머지 이력 유지', () => {
  const first = collect([row('new', '2026-02-02'), row('old')], { cap: 1 });
  const oldDoc = first.archives['2026-02'];
  const duplicate = { ...oldDoc.items[0], id: 'seoul-20260201-009', title: '다른 제목' };
  const archives = { '2026-02': { ...oldDoc, items: [...oldDoc.items, duplicate] } };
  const next = replay({ notices: first.notices, archives }, [batch([row('other')])], { cap: 1 });
  assert.deepEqual(next.archives['2026-02'].items.map(item => item.id), [
    oldDoc.items[0].id, 'seoul-20260201-010',
  ]);
  assert.deepEqual(next.archives['2026-02'].items[0], oldDoc.items[0]);
});

test('기본 상한 2000건을 넘겨도 이력과 네 자리 순번 유지', () => {
  const all = Array.from({ length: 2003 }, (_, i) => row(String(i).padStart(4, '0')));
  const result = collect(all);
  assert.equal(result.notices.items.length, 2000);
  assert.equal(result.archives['2026-02'].items.length, 3);
  assert.equal(result.archives['2026-02'].items.at(-1).id, 'seoul-20260201-2003');
  assert.equal(result.stats.added, all.length);
  assert.equal(check(result), true);
});

test('잘못된 행은 개별 집계하고 제목을 URL에서 생성하지 않음', () => {
  const valid = { ...row('ok'), department: '  교통과  ' };
  const result = collect([
    null, { url: `${BASE}/article/title-from-slug` }, { ...row('blank'), title: '  ' },
    { ...row('long'), title: '가'.repeat(301) }, { ...row('tag'), title: '<b>공지</b>' },
    { ...row('dept'), department: {} }, { ...row('bad'), url: 'https://else.example.kr/post/8' },
    { ...row('signed'), url: `${BASE}/post/1?token=abc` }, valid,
  ]);
  assert.equal(result.notices.items.length, 1);
  assert.equal(result.notices.items[0].department, '교통과');
  assert.deepEqual(result.stats.bySource.seoul, {
    seen: 9, added: 1, duplicates: 0, undated: 0, skipped: 8,
  });
  assert.equal(result.stats.skipped, 8);
});

test('지원하지 않는 입력 필드와 배치 형식은 위치를 포함해 거부', () => {
  for (const key of ['body', 'summary', 'id', 'fetchedAt', 'sourceId', 'html', 'cookie']) {
    assert.throws(() => collect([row('ok'), { ...row('bad'), [key]: '오염' }]),
      /batches\[0\]\.items\[1\]/);
  }
  assert.throws(() => collect([], { batches: [{ ...batch([]), raw: {} }] }), /batches\[0\]/);
  assert.throws(() => collect([], { batches: [batch([], 'unknown')] }), /batches\[0\]/);
  assert.throws(() => collect([], { batches: {} }), /배치/);
});

test('후보·활성 출처만 신규 등록하고 중단된 후보의 기존 공지는 검증 가능', () => {
  const historical = collect([row('past')]);
  const paused = { ...source, status: 'paused' };
  assert.equal(check(historical, { sources: [paused] }), true);
  for (const invalid of [
    paused, { ...source, role: 'reference' }, { ...source, itemKind: 'event' },
    { ...second, itemKind: 'event' },
  ]) {
    const next = collect([], { sources: [invalid], batches: [batch([row('bad')], invalid.id)] });
    assert.deepEqual(next.notices, empty());
    assert.equal(next.stats.skipped, 1);
  }
  const culture = { ...source, category: 'culture', itemKind: 'event' };
  const events = collect([row('festival')], { sources: [culture] });
  assert.equal(check(events, { sources: [culture] }), true);
  for (const category of ['government', 'district']) {
    const forged = structuredClone(events);
    forged.notices.items[0].category = category;
    assert.throws(() => check(forged, { sources: [{ ...culture, category }] }), /출처/);
  }
});

test('전체 검증에서 ID·URL·출처·필드·정렬·보관 경계 검사', () => {
  const first = collect([
    row('a', '2026-02-03'), row('b', '2026-02-02'),
    row('c', '2026-02-01'), row('d', '2026-01-31'),
  ], { cap: 2 });
  const invalid = change => {
    const copy = structuredClone(first);
    change(copy.notices.items, copy.archives, copy.notices);
    assert.throws(() => check(copy, { cap: 2 }));
  };
  invalid(live => { live[0].body = '원문'; });
  invalid(live => { delete live[0].department; });
  invalid(live => { live[0].title = ''; });
  invalid(live => { live[0].category = '문화'; });
  invalid(live => { live[0].sourceName = '다른 기관'; });
  invalid(live => { live[0].sourceId = second.id; });
  invalid(live => { live[0].url = 'https://bad.example.kr/article/1'; });
  invalid(live => { live[0].url += '?access_token=abc'; });
  invalid(live => { live[0].id = 'seoul-00000000-001'; });
  invalid(live => { live.reverse(); });
  invalid((live, archives) => { archives['2026-02'].items[0].url = live[0].url; });
  invalid((live, archives) => { archives['2026-02'].items[0].url = `${live[0].url}?utm_source=x`; });
  invalid((live, archives) => {
    archives['2026-02'].items[0] = { ...live[0], url: `${BASE}/article/unique` };
  });
  invalid((live, archives) => {
    [live[1], archives['2026-02'].items[0]] = [archives['2026-02'].items[0], live[1]];
  });
  invalid((live, archives) => { live.push(archives['2026-02'].items.pop()); });
  invalid(live => { live.pop(); });
  invalid((live, archives) => { archives.undated = archives['2026-01']; delete archives['2026-01']; });
  invalid((live, archives, doc) => { doc.updatedAt = null; });
  invalid((live, archives) => { archives['2026-02'].items.push(live[0]); });
  assert.equal(check(first, { cap: 2 }), true);
});

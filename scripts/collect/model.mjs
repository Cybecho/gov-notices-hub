import { isIP } from 'node:net';
import { domainToASCII } from 'node:url';

const EMPTY = { updatedAt: null, items: [] };
const PUBLIC_FIELDS = [
  'id', 'title', 'publishedAt', 'fetchedAt', 'sourceId',
  'sourceName', 'category', 'kind', 'department', 'url',
];
const INPUT_FIELDS = ['title', 'url', 'publishedAt', 'department'];
const CONTROLS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
const TRACKING = /^(?:utm_.+|fbclid|gclid|dclid|msclkid|igshid|mc_cid|mc_eid|_ga|_gl|ref_src|ref_url)$/i;
const LOCAL_HOST = /(?:^|\.)(?:localhost|localdomain|internal|intranet|local|lan|home|corp|onion|arpa|nip\.io|sslip\.io|lvh\.me)$/i;
const SECRET_PART = /token|password|passwd|secret|signature|credential|session|authorization|apikey|accesskey|servicekey|privatekey|authkey|authcode|userid|username|userno|memberid|memberno|membername|loginid|personid|email|phone|mobile|resident|주민|전화|이메일|회원/iu;
const SECRET_KEY = /^(?:auth|key|sig|sid|jwt|pwd|ssn|rrn|uid|ci|di|tel|name|fullname|address|birthdate|samlresponse|policy|keypairid|ticket|codeverifier|xamz.*|xgoog.*|oauth.*|expires|se|sv|skoid|sktid|returnurl|redirecturi|redirecturl)$/i;
const PRIVATE_VALUE = /[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:^|\D)\d{6}[- ]?[1-8]\d{6}(?:$|\D)|(?:^|\D)(?:01[016789]|\+82[- ]?1[016789])[- ]?\d{3,4}[- ]?\d{4}(?:$|\D)|(?:^|\s)Bearer\s+|eyJ[\w-]+\.[\w-]+\.[\w-]+/iu;
const ARTICLE_ID = /^(?:id|no|seq|idx|sn|bcidx|(?:article|notice|post|board|ntt|news|content|data|event|pst)(?:id|no|seq|idx|sn))$/i;
const NON_ARTICLE_PATH = /(?:^|\/)(?:login|logout|auth|oauth|token|download|filedown|attachfile|privacy)(?:\/|\.|$)/i;
const FILE_PATH = /\.(?:pdf|hwpx?|docx?|xlsx?|pptx?|zip|png|jpe?g|gif|webp|svg|exe|js|css)\/?$/i;
const LIST_PATH = /(?:^\/$|\/(?:index|home|main|news|notices|events|list|[a-z]*list|search)(?:\.[a-z0-9]+)?\/?$)/i;

function fail(where, message) {
  throw new TypeError(`${where} — ${message}`);
}

function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function record(value) {
  return value !== null && typeof value === 'object' &&
    [null, Object.prototype].includes(Object.getPrototypeOf(value));
}

function fields(obj, allowed, where, exact = false) {
  if (!record(obj)) fail(where, '객체가 필요합니다');
  if (Reflect.ownKeys(obj).some(key => !allowed.includes(key)) ||
      (exact && !allowed.every(key => Object.hasOwn(obj, key)))) {
    fail(where, '지원하지 않는 필드 구성입니다');
  }
}

function hostName(raw) {
  if (typeof raw !== 'string' || /[^\p{L}\p{N}.-]/u.test(raw)) return null;
  const host = domainToASCII(raw).toLowerCase().replace(/\.$/, '');
  const label = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  if (!host.includes('.') || host.length > 253 || isIP(host) ||
      LOCAL_HOST.test(host) || host.split('.').some(part => !label.test(part))) {
    return null;
  }
  return host;
}

export function canonicalUrl(value, base, allowedHosts) {
  if (typeof value !== 'string' || value.length > 2048 || CONTROLS.test(value) ||
      value.includes('\\') || /%(?![0-9a-f]{2})/i.test(value)) return null;

  const input = value.trim();
  if (!input || input.startsWith('#') ||
      /^[a-z][a-z0-9+.-]*:(?!\/\/)/i.test(input) ||
      /^(?:https?:)?\/\/[^/?#]*@/i.test(input)) return null;

  try {
    const url = new URL(input, base);
    if (!['http:', 'https:'].includes(url.protocol) ||
        url.username || url.password || url.port) return null;

    const host = hostName(url.hostname);
    if (!host || (allowedHosts !== undefined &&
        (!Array.isArray(allowedHosts) || !allowedHosts.some(h => hostName(h) === host)))) {
      return null;
    }

    const path = decodeURIComponent(url.pathname);
    if (CONTROLS.test(path) || /[\\?#]|%[a-f0-9]{2}|;jsessionid=/i.test(path) ||
        PRIVATE_VALUE.test(path) || NON_ARTICLE_PATH.test(path) || FILE_PATH.test(path)) {
      return null;
    }

    const pairs = [];
    let hasArticleId = false;
    for (const [key, val] of url.searchParams) {
      const folded = key.normalize('NFKC').toLowerCase().replace(/[\s_.[\]-]/g, '');
      if (!folded || key.length > 100 || val.length > 512 ||
          CONTROLS.test(key + val) || SECRET_PART.test(folded) || SECRET_KEY.test(folded) ||
          PRIVATE_VALUE.test(`${key}=${val}`) || /%[a-f0-9]{2}|:\/\//i.test(key + val)) {
        return null;
      }
      if (TRACKING.test(key)) continue;
      if (ARTICLE_ID.test(folded) && val.trim()) hasArticleId = true;
      pairs.push([key, val]);
    }
    if (LIST_PATH.test(path) && !hasArticleId) return null;

    url.protocol = 'https:';
    url.hostname = host;
    url.hash = '';
    url.search = '';
    pairs.sort(([ka, va], [kb, vb]) => compare(ka, kb) || compare(va, vb));
    for (const [key, val] of pairs) url.searchParams.append(key, val);
    return url.href.length <= 2048 ? url.href : null;
  } catch {
    return null;
  }
}

function validDay(year, month, day) {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

function displayKst(ms) {
  const shifted = new Date(ms + 9 * 3600000);
  const year = shifted.getUTCFullYear();
  if (!(year >= 1 && year <= 9999)) return null;
  return shifted.toISOString().replace(/(?:\.000)?Z$/, '+09:00');
}

export function kstDate(raw) {
  if (raw instanceof Date) return displayKst(raw.getTime());
  if (typeof raw !== 'string' || raw.length > 80) return null;
  const value = raw.trim();

  const korean = /^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일$/.exec(value);
  const numeric = /^(\d{4})\s*([./-])\s*(\d{1,2})\s*\2\s*(\d{1,2})(\.?)$/.exec(value);
  if (korean || numeric) {
    if (numeric && numeric[5] && numeric[2] !== '.') return null;
    const [, y, m, d] = korean || [null, numeric[1], numeric[3], numeric[4]];
    if (!validDay(+y, +m, +d)) return null;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00+09:00`;
  }

  const timed = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})$/i.exec(value);
  if (!timed) return null;
  const [, y, m, d, hh, mm, ss = '00', fraction = '', zone] = timed;
  if (!validDay(+y, +m, +d) || +hh > 23 || +mm > 59 || +ss > 59 ||
      (zone.length > 1 && (+zone.slice(1, 3) > 23 || +zone.slice(-2) > 59))) return null;
  return displayKst(Date.parse(`${y}-${m}-${d}T${hh}:${mm}:${ss}${fraction}${zone.toUpperCase()}`));
}

function cleanText(value, limit) {
  if (typeof value !== 'string' || value.length > limit ||
      CONTROLS.test(value) || /[<>]/.test(value)) return null;
  return value.trim().replace(/\s+/gu, ' ') || null;
}

function registry(sources) {
  if (!Array.isArray(sources)) fail('sources', '배열이 필요합니다');
  const map = new Map();
  for (const source of sources) {
    if (!record(source) || typeof source.id !== 'string' ||
        !/^[\p{L}\d][\p{L}\d_-]{0,79}$/u.test(source.id) || map.has(source.id)) {
      fail('sources', '잘못되거나 중복된 출처 ID입니다');
    }
    map.set(source.id, source);
  }
  return map;
}

function eligible(source) {
  if (!source || source.role !== 'candidate' || !Array.isArray(source.allowedHosts) ||
      !source.allowedHosts.length || ![source.name, source.category, source.itemKind]
        .every(v => typeof v === 'string' && v.length && cleanText(v, 120) === v)) {
    return false;
  }
  const official = /^(?:gov|government|district)$|정부|자치구|구청|지자체/i.test(source.category);
  return !(official && /event|행사|이벤트/i.test(source.itemKind));
}

function checkCap(cap) {
  if (!Number.isInteger(cap) || cap < 0 || cap > 2000) fail('cap', '0~2000 정수가 필요합니다');
}

const stamp = value => typeof value === 'string' && kstDate(value) === value;
const monthKey = item => item.publishedAt?.slice(0, 7) || 'undated';

function prefix(item) {
  const day = item.publishedAt?.slice(0, 10).replaceAll('-', '') || '00000000';
  return `${item.sourceId}-${day}-`;
}

function recent(a, b) {
  if (a.publishedAt === b.publishedAt) return 0;
  if (!a.publishedAt) return 1;
  if (!b.publishedAt) return -1;
  return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
}

function corpus(live, archives) {
  if (!record(archives)) fail('archives', '객체가 필요합니다');
  const docs = [[null, live], ...Object.entries(archives)];
  for (const [key, doc] of docs) {
    const where = key ?? 'notices';
    if (key !== null && key !== 'undated' && !/^(?!0000)\d{4}-(?:0[1-9]|1[0-2])$/.test(key)) {
      fail(where, '잘못된 보관 월입니다');
    }
    fields(doc, ['updatedAt', 'items'], where, true);
    if (!Array.isArray(doc.items) ||
        !(stamp(doc.updatedAt) || (doc.updatedAt === null && doc.items.length === 0))) {
      fail(where, '잘못된 문서입니다');
    }
  }
  return docs;
}

function inspectItem(item, reg, where) {
  fields(item, PUBLIC_FIELDS, where, true);
  const source = reg.get(item.sourceId);
  if (!eligible(source) || item.sourceName !== source.name ||
      item.category !== source.category || item.kind !== source.itemKind) {
    fail(where, '출처가 일치하지 않습니다');
  }
  if (!item.title || cleanText(item.title, 300) !== item.title ||
      !(item.department === null ||
        (item.department && cleanText(item.department, 120) === item.department))) {
    fail(where, '잘못된 제목 또는 부서입니다');
  }
  if (!(item.publishedAt === null || stamp(item.publishedAt)) || !stamp(item.fetchedAt)) {
    fail(where, '잘못된 일시입니다');
  }
  const start = prefix(item);
  if (typeof item.id !== 'string' || !item.id.startsWith(start)) fail(where, 'ID 접두어 오류입니다');
  const seq = item.id.slice(start.length);
  if (!/^(?:\d{3}|[1-9]\d{3,17})$/.test(seq) || seq === '000') fail(where, 'ID 순번 오류입니다');
  const url = canonicalUrl(item.url, undefined, source.allowedHosts);
  if (!url) fail(where, '잘못된 원문 링크입니다');
  return { url, seq: BigInt(seq) };
}

export function validateData({ notices, archives, sources, cap = 2000 }) {
  checkCap(cap);
  const reg = registry(sources);
  const ids = new Set();
  const urls = new Set();
  const docs = corpus(notices, archives);
  if (notices.items.length > cap) fail('notices', '상한을 초과했습니다');

  for (const [key, doc] of docs) {
    for (const [i, item] of doc.items.entries()) {
      const where = `${key ?? 'notices'}.items[${i}]`;
      const { url } = inspectItem(item, reg, where);
      if (urls.has(url) || ids.has(item.id)) fail(where, '중복 URL 또는 ID입니다');
      if (item.url !== url) fail(where, '정규화되지 않은 원문 링크입니다');
      if (i && recent(doc.items[i - 1], item) > 0) fail(where, '게시일 정렬 오류입니다');
      if (key !== null && (monthKey(item) !== key || notices.items.length < cap ||
          (cap > 0 && recent(notices.items.at(-1), item) > 0))) {
        fail(where, '보관 위치 또는 최신순 경계 오류입니다');
      }
      if (Date.parse(item.fetchedAt) > Date.parse(doc.updatedAt)) fail(where, '문서 갱신 시각 오류입니다');
      urls.add(url);
      ids.add(item.id);
    }
  }
  return true;
}

const counts = () => ({ seen: 0, added: 0, duplicates: 0, undated: 0 });

export function mergeNotices({ previous = EMPTY, archives = {}, sources, batches, now, cap = 2000 }) {
  checkCap(cap);
  const reg = registry(sources);
  const fetchedAt = kstDate(now);
  if (!fetchedAt || !Array.isArray(batches)) fail('mergeNotices', '수집 시각과 배치 배열이 필요합니다');

  const rows = new Map();
  const reserved = new Map();
  const sequences = new Map();
  for (const [key, doc] of corpus(previous, archives)) {
    for (const [i, item] of doc.items.entries()) {
      const where = `${key ?? 'notices'}.items[${i}]`;
      const { url, seq } = inspectItem(item, reg, where);
      if (reserved.has(item.id) && reserved.get(item.id) !== url) fail(where, '서로 다른 원문의 ID 충돌입니다');
      reserved.set(item.id, url);
      const start = prefix(item);
      if (seq > (sequences.get(start) || 0n)) sequences.set(start, seq);
      if (!rows.has(url)) rows.set(url, item.url === url ? item : { ...item, url });
    }
  }

  const perSource = new Map([...reg.keys()].map(id => [id, counts()]));
  const stats = { added: 0, duplicates: 0, undated: 0, bySource: {} };
  const fresh = [];
  for (const [b, batch] of batches.entries()) {
    const where = `batches[${b}]`;
    fields(batch, ['sourceId', 'items'], where, true);
    if (!Array.isArray(batch.items) || !reg.has(batch.sourceId)) fail(where, '잘못된 배치 또는 미등록 출처입니다');
    const source = reg.get(batch.sourceId);
    const tally = perSource.get(source.id);
    const active = source.status === 'active' && eligible(source);
    for (const [i, row] of batch.items.entries()) {
      tally.seen++;
      if (record(row)) fields(row, INPUT_FIELDS, `${where}.items[${i}]`);
      const title = cleanText(row?.title, 300);
      const url = canonicalUrl(row?.url, undefined, source.allowedHosts);
      const department = cleanText(row?.department, 120);
      if (!record(row) || !active || !title || !url ||
          (row.department != null && row.department !== '' && !department) ||
          (row.publishedAt != null && (typeof row.publishedAt !== 'string' || row.publishedAt.length > 80))) {
        tally.skipped = (tally.skipped || 0) + 1;
        stats.skipped = (stats.skipped || 0) + 1;
        continue;
      }
      if (rows.has(url)) {
        tally.duplicates++;
        stats.duplicates++;
        continue;
      }
      const publishedAt = kstDate(row.publishedAt);
      const item = {
        id: '', title, publishedAt, fetchedAt, sourceId: source.id, sourceName: source.name,
        category: source.category, kind: source.itemKind, department, url,
      };
      rows.set(url, item);
      fresh.push(item);
      tally.added++;
      stats.added++;
      if (!publishedAt) {
        tally.undated++;
        stats.undated++;
      }
    }
  }
  stats.bySource = Object.fromEntries(perSource);

  // ID allocation is independent of listing order. Display ties retain first-seen order.
  fresh.sort((a, b) => compare(a.sourceId, b.sourceId) || compare(a.url, b.url));
  for (const item of fresh) {
    const start = prefix(item);
    const seq = (sequences.get(start) || 0n) + 1n;
    item.id = start + String(seq).padStart(3, '0');
    sequences.set(start, seq);
  }

  const ordered = [...rows.values()].sort(recent);
  const buckets = new Map(Object.keys(archives).map(key => [key, []]));
  for (const item of ordered.slice(cap)) {
    const key = monthKey(item);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }

  let changed = false;
  function document(old, items) {
    if (old && old.items.length === items.length && items.every((item, i) => old.items[i] === item)) {
      return old;
    }
    changed = true;
    return { updatedAt: fetchedAt, items };
  }

  const notices = document(previous, ordered.slice(0, cap));
  const result = Object.fromEntries([...buckets].map(([key, items]) => [key, document(archives[key], items)]));
  validateData({ notices, archives: result, sources, cap });
  return { notices, archives: result, stats, changed };
}

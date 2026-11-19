export const categories = [
  ['E1', '호텔 실적'], ['E2', '관광 동향'], ['E3', '호텔 시장'],
  ['E4', '여행자 설문'], ['E5', '도시 현황']
];

export const districts = [
  '강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구',
  '금천구', '노원구', '도봉구', '동대문구', '동작구', '마포구', '서대문구',
  '서초구', '성동구', '성북구', '송파구', '양천구', '영등포구', '용산구',
  '은평구', '종로구', '중구', '중랑구'
];

const day = 86_400_000;
const iso = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d)(?::(\d\d)(?:\.(\d+))?)?(Z|[+-]\d\d:\d\d))?$/i;
const kstDate = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric'
});
const kstTime = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

export function timestamp(value, allowDate = false) {
  if (typeof value !== 'string') return null;
  const parts = iso.exec(value);
  if (!parts || (!allowDate && !parts[4])) return null;
  const [, y, m, d, h, min, sec] = parts;
  const lastDay = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
  if (+m < 1 || +m > 12 || +d < 1 || +d > lastDay ||
      +h > 23 || +min > 59 || +sec > 59) return null;
  const ms = Date.parse(parts[4] ? value : `${value}T00:00:00+09:00`);
  return Number.isFinite(ms) ? ms : null;
}

export function dateLabel(ms, withTime = false) {
  if (!Number.isFinite(ms)) return withTime ? '시각 미확인' : '날짜 미확인';
  return `${kstDate.format(ms)}${withTime ? ` ${kstTime.format(ms)}` : ''} KST`;
}

export function isNew(ms, now = Date.now()) {
  return Number.isFinite(ms) && ms <= now && now - ms < day;
}

export function searchText(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('ko').trim();
}

export function badgeTone(id) {
  let hash = 0;
  for (const char of String(id)) hash = (Math.imul(hash, 31) + char.codePointAt(0)) | 0;
  return `tone-${(hash >>> 0) % 6}`;
}

export function sourceLink(raw, directorySource = null) {
  if (typeof raw !== 'string' || !/^https?:\/\//i.test(raw) ||
      /[\s\\\u0000-\u001f\u007f]/u.test(raw)) return null;
  try {
    const url = new URL(raw);
    const hotelsKorea = directorySource?.kind === 'static' &&
      directorySource.listUrl === raw &&
      /^(?:www\.)?hotelskorea\.(?:com|kr|co\.kr|or\.kr)$/i.test(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && hotelsKorea)) return null;
    if (url.username || url.password) return null;
    const sensitive = /token|secret|signature|credential|password|api[-_]?key|service[-_]?key|^auth(?:orization)?$|^sig$|^x-amz-/i;
    for (const params of [url.searchParams, new URLSearchParams(url.hash.slice(1))]) {
      for (const key of params.keys()) if (sensitive.test(key)) return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

export function archiveEntries(index) {
  if (!Array.isArray(index?.files)) throw new Error('보관 색인 형식 오류');
  const paths = new Set();
  return index.files.filter(file => {
    if (typeof file?.month !== 'string' ||
        !/^(?:\d{4}-(?:0[1-9]|1[0-2])|undated)$/.test(file.month) ||
        file.path !== `data/archive/${file.month}.json` ||
        !Number.isSafeInteger(file.count) || file.count < 0) {
      throw new Error('보관 파일 정보 오류');
    }
    if (paths.has(file.path)) return false;
    paths.add(file.path);
    return true;
  });
}

export function archiveItems(payload) {
  const items = Array.isArray(payload) ? payload : payload?.items;
  if (!Array.isArray(items)) throw new Error('보관 글 형식 오류');
  return items;
}

export function makeFeed(sources, live, archives) {
  const candidates = new Map(sources.filter(s => s.role === 'candidate').map(s => [s.id, s]));
  const unique = new Map();
  // Live metadata wins. A duplicate can still supply an earlier first-seen time.
  for (const group of [live, ...archives]) {
    for (const item of group) {
      const source = candidates.get(item?.sourceId);
      if (!source || typeof item.title !== 'string' || !item.title.trim()) continue;
      const href = sourceLink(item.url);
      const id = String(item.id ?? '').trim() || href;
      if (!id) continue;
      const key = JSON.stringify([source.id, id]);
      const fetched = timestamp(item.fetchedAt);
      const existing = unique.get(key);
      if (existing) {
        if (fetched !== null && (existing.fetched === null || fetched < existing.fetched)) {
          existing.fetched = fetched;
        }
        continue;
      }
      unique.set(key, {
        key, title: item.title.trim(), href, sourceId: source.id,
        sourceName: source.name || item.sourceName || source.id,
        category: item.category || source.category,
        published: timestamp(item.publishedAt, true), fetched
      });
    }
  }
  return [...unique.values()].sort((a, b) =>
    (b.published ?? -Infinity) - (a.published ?? -Infinity) ||
    a.title.localeCompare(b.title, 'ko') || a.key.localeCompare(b.key)
  );
}

export function filterFeed(feed, { source, category, query }) {
  const needle = searchText(query);
  return feed.filter(item =>
    (!source || item.sourceId === source) &&
    (!category || item.category === category) &&
    (!needle || searchText(item.title).includes(needle))
  );
}

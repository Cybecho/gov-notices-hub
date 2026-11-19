import {
  categories, districts, timestamp, dateLabel, isNew, searchText,
  badgeTone, sourceLink, archiveEntries, archiveItems, makeFeed, filterFeed
} from './view-model.mjs';

const $ = selector => document.querySelector(selector);
const root = new URL('../', import.meta.url);
const pageSize = 16;
const filters = { source: '', category: '', query: '' };
const panels = [...document.querySelectorAll('main > section')];
const navLinks = [...document.querySelectorAll('#navigation a')];
const archive = new Map();
const slots = { sources: null, live: null, health: null, index: null };
const failures = new Map();
let archiveFailures = 0;
let archivePending = false;
let loading = false;
let limit = pageSize;
let feed = [];
let freshnessTimer;
const directoryNames = {
  candidate: 'candidate', government: 'government',
  dashboard: 'dashboard', reference: 'reference'
};

function node(tag, value, className) {
  const element = document.createElement(tag);
  if (value !== undefined && value !== null) element.textContent = String(value);
  if (className) element.className = className;
  return element;
}

function external(href, label) {
  const a = node('a', label);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.referrerPolicy = 'no-referrer';
  return a;
}

function number(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString('ko-KR') : '미확인';
}

function configureEmbed() {
  if (new URLSearchParams(location.search).get('embed') !== 'atlas') return;
  document.documentElement.classList.add('embedded');
  const standalone = $('#standalone');
  const url = new URL(location.pathname, location.origin);
  function updateLink() {
    url.hash = panels.some(p => `#${p.id}` === location.hash) ? location.hash : '#timeline';
    standalone.href = url.href;
  }
  updateLink();
  standalone.hidden = false;
  window.addEventListener('hashchange', updateLink);
  if (window.parent === window) return;
  const reader = $('#reader');
  let lastHeight = -1;
  let frame = 0;
  function measure() {
    frame = 0;
    const height = Math.ceil(reader.getBoundingClientRect().height);
    if (height > 0 && height !== lastHeight) {
      lastHeight = height;
      window.parent.postMessage({ type: 'gov-hub:height', height }, 'https://cybecho.github.io');
    }
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(measure);
  }
  if ('ResizeObserver' in window) new ResizeObserver(schedule).observe(reader);
  window.addEventListener('resize', schedule);
  window.addEventListener('load', schedule);
  schedule();
}

function route(moveFocus = false) {
  const selected = panels.find(panel => `#${panel.id}` === location.hash);
  if (!selected && location.hash === '#main') return;
  const active = selected || $('#timeline');
  for (const panel of panels) panel.hidden = panel !== active;
  for (const a of navLinks) {
    if (a.hash === `#${active.id}`) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  document.title = `${active.querySelector('h1').textContent} · 서울 관광 아틀라스`;
  if (moveFocus) active.querySelector('h1').focus({ preventScroll: true });
}

function chip(group, value, label, count, disabled = false) {
  const b = node('button', label, 'chip');
  b.type = 'button';
  b.dataset.group = group;
  b.dataset.value = value;
  b.disabled = disabled;
  b.setAttribute('aria-pressed', String(filters[group] === value));
  if (count !== undefined) b.append(node('span', number(count), 'chip-count'));
  return b;
}

function drawFilters() {
  const counts = new Map();
  for (const item of feed) counts.set(item.sourceId, (counts.get(item.sourceId) || 0) + 1);
  const sources = (slots.sources || []).filter(s => s.role === 'candidate');
  const buttons = [chip('source', '', '전체 출처', slots.sources && (slots.live || archive.size) ? feed.length : undefined)];
  const other = [];
  for (const s of sources) {
    const count = counts.get(s.id) || 0;
    const paused = s.status === 'paused';
    const unavailable = s.status !== 'active' && !count;
    (unavailable ? other : buttons).push(chip('source', s.id, `${s.name}${paused ? ' · 보류' : s.status === 'static' ? ' · 링크 전용' : ''}`, count, unavailable));
  }
  const focused = document.activeElement?.dataset;
  const restore = focused?.group ? [focused.group, focused.value] : null;
  $('#source-filters').replaceChildren(...buttons);
  $('#other-source-filters').replaceChildren(...other);
  $('#other-filter-box').hidden=!other.length;
  $('#other-filter-box summary').textContent=`자동 수집 제외 출처 ${other.length}곳 보기`;
  $('#category-filters').replaceChildren(
    chip('category', '', '전체 주제'),
    ...categories.map(([code, label]) => chip('category', code, `${code} ${label}`))
  );
  if (restore) {
    const next = [...document.querySelectorAll('.chip')].find(b =>
      b.dataset.group === restore[0] && b.dataset.value === restore[1] && !b.disabled);
    next?.focus({ preventScroll: true });
  }
}

function articleRow(item, now) {
  const row = node('li', null, 'article');
  const date = node(item.published === null ? 'span' : 'time', dateLabel(item.published), 'date');
  if (item.published !== null) date.dateTime = new Date(item.published).toISOString();
  const body = node('div', null, 'article-body');
  const meta = node('div', null, 'article-meta');
  meta.append(node('span', item.sourceName, `badge ${badgeTone(item.sourceId)}`));
  const category = categories.find(([code]) => code === item.category);
  if (category) meta.append(node('span', category.join(' · '), 'topic'));
  if (isNew(item.fetched, now)) {
    const fresh = node('span', 'NEW', 'fresh');
    fresh.setAttribute('aria-label', '최근 24시간 이내 최초 수집');
    meta.append(fresh);
  }
  const heading = node('h3');
  if (item.href) {
    const link = external(item.href, item.title);
    const arrow = node('span', ' ↗', 'arrow');
    arrow.setAttribute('aria-hidden', 'true');
    link.append(arrow, node('span', ' (원문, 새 창)', 'sr-only'));
    heading.append(link);
  } else {
    heading.append(node('span', item.title), node('small', '원문 주소 미확인', 'missing'));
  }
  body.append(meta, heading);
  row.append(date, body);
  return row;
}

function drawFeed(focusIndex = -1) {
  const items = filterFeed(feed, filters);
  const shown = Math.min(limit, items.length);
  const now = Date.now();
  const list = $('#articles');
  const rows = items.slice(0, shown).map(item => articleRow(item, now));
  list.replaceChildren(...rows);
  const more = $('#load-more');
  more.hidden = shown >= items.length;
  more.textContent = `글 ${Math.min(pageSize, items.length - shown)}개 더 보기`;
  $('#result-count').textContent = items.length ? `${number(items.length)}건 중 ${number(shown)}건 표시` : '';
  const available = slots.live !== null || archive.size > 0;
  let message = '';
  if (!slots.sources) message = failures.has('sources') ? '출처 목록을 읽을 수 없어 글 분류를 확인할 수 없습니다.' : '출처를 확인하고 있습니다.';
  else if (!available) message = failures.has('live') ? '최신 글 목록을 불러오지 못했습니다.' : '글 목록을 불러오는 중입니다.';
  else if (!items.length) {
    if (loading || archivePending) message = '현재 읽은 자료에 일치하는 글이 없습니다. 나머지 자료를 확인하고 있습니다.';
    else if (filters.query || filters.source || filters.category) message = '현재 자료에 검색 조건과 일치하는 글이 없습니다.';
    else message = '현재 불러온 자료에 리서치 글이 없습니다.';
  } else if (failures.has('live')) message = '최신 목록을 읽지 못해 기존에 확인한 글을 표시합니다.';
  $('#feed-state').textContent = message;
  $('#feed-state').hidden = !message;
  $('#updated').textContent = `최신 목록 갱신 · ${dateLabel(timestamp(slots.live?.updatedAt), true)}`;
  if (focusIndex >= 0 && rows[focusIndex]) {
    const target = rows[focusIndex].querySelector('a') || rows[focusIndex];
    if (!target.matches('a')) target.tabIndex = -1;
    target.focus();
  }
  // Re-evaluate visible badges at their next transition, including future timestamps.
  clearTimeout(freshnessTimer);
  let next = Infinity;
  for (const item of items.slice(0, shown)) {
    if (item.fetched === null) continue;
    const boundary = item.fetched > now ? item.fetched : item.fetched + 86_400_000;
    if (boundary > now) next = Math.min(next, boundary);
  }
  if (Number.isFinite(next)) {
    freshnessTimer = setTimeout(() => {
      // Only change badges in place so keyboard focus stays on the article.
      const visible = items.slice(0, shown);
      const at = Date.now();
      rows.forEach((row, index) => {
        const meta = row.querySelector('.article-meta');
        const fresh = articleRow(visible[index], at).querySelector('.fresh');
        meta.querySelector('.fresh')?.remove();
        if (fresh) meta.append(fresh);
      });
      scheduleBadgeUpdates();
    }, Math.min(next - now + 1, 2_147_483_647));
  }
}

function scheduleBadgeUpdates() {
  clearTimeout(freshnessTimer);
  const visible = filterFeed(feed, filters).slice(0, limit);
  const now = Date.now();
  let next = Infinity;
  visible.forEach((item, i) => {
    const meta = $('#articles').children[i]?.querySelector('.article-meta');
    if (!meta || item.fetched === null) return;
    const fresh = meta.querySelector('.fresh');
    if (fresh && !isNew(item.fetched, now)) fresh.remove();
    if (!fresh && isNew(item.fetched, now)) meta.append(articleRow(item, now).querySelector('.fresh'));
    const at = item.fetched > now ? item.fetched : item.fetched + 86_400_000;
    if (at > now) next = Math.min(next, at);
  });
  if (Number.isFinite(next)) {
    freshnessTimer = setTimeout(scheduleBadgeUpdates, Math.min(next - now + 1, 2_147_483_647));
  }
}

function updateFeed() {
  feed = makeFeed(slots.sources || [], slots.live?.items || [], archive.values());
  drawFilters();
  drawFeed();
}

function checkedLabel(s) {
  const time = dateLabel(timestamp(s.lastChecked), true);
  if (s.lastError) return `최근 점검 오류 · ${time}`;
  if (timestamp(s.lastChecked) === null) return '최근 점검 기록 미확인';
  return `최근 점검 ${time} · 항목 ${number(s.lastItemCount)}`;
}

function directoryRow(s, title = s.name, requireVerified = false) {
  const row = node('li');
  const href = sourceLink(s.listUrl, s);
  const verified = s.boardVerified === true && Boolean(href);
  const linkAllowed = href && (!requireVerified || verified);
  const body = node('div');
  const heading = node('h3');
  if (linkAllowed) {
    const label = `${title}${href.startsWith('http:') ? ' (HTTP 정적 링크)' : ''} ↗`;
    heading.append(external(href, label));
  } else heading.textContent = title;
  body.append(heading);
  if (typeof s.note === 'string' && s.note.trim()) body.append(node('p', s.note));
  const collecting = s.role === 'candidate' && s.kind !== 'static' && s.status !== 'static';
  const mode = collecting ? (s.status === 'paused' ? '수집 중지' : s.status === 'active' ? '수집 활성' : '수집 상태 미확인') : '링크 안내';
  body.append(node('small', `${s.category} · ${mode} · ${verified ? '게시판 확인' : s.role === 'district' || !href ? '게시판 미확인' : '원문 참고 링크'}${collecting ? ' · '+checkedLabel(s) : ''}`));
  row.append(body);
  return row;
}

function directoryEmpty() {
  if (slots.sources) return '등록된 출처가 없습니다.';
  return failures.has('sources') ? '출처 목록을 불러오지 못했습니다.' : '출처 확인 중';
}

function drawDistricts() {
  const needle = searchText($('#district-search').value);
  const matches = districts.filter(name => searchText(`${name} ${name}청`).includes(needle));
  const registered = (slots.sources || []).filter(s => s.role === 'district');
  const rows = [];
  let verifiedCount = 0;
  for (const name of matches) {
    const districtSources = registered.filter(s => s.district === name || String(s.name).includes(name));
    if (districtSources.some(s => s.boardVerified === true && sourceLink(s.listUrl, s))) verifiedCount++;
    if (districtSources.length) {
      for (const s of districtSources) rows.push(directoryRow(s, s.name, true));
    } else {
      const row = node('li');
      row.append(node('h3', `${name}청`), node('small', '게시판 미확인'));
      rows.push(row);
    }
  }
  $('#district-directory').replaceChildren(...rows);
  $('#district-count').textContent = matches.length
    ? `서울 25개 구 중 ${matches.length}개 표시 · ${slots.sources ? `표시된 구 중 게시판 확인 ${verifiedCount}개` : directoryEmpty()}`
    : '일치하는 구청이 없습니다.';
}

function drawDirectories() {
  const sources = slots.sources || [];
  for (const [role, id] of Object.entries(directoryNames)) {
    const selected = sources.filter(s => s.role === role);
    const rows = [];
    const names = Object.fromEntries([...categories,['F1','공시 원문'],['F2','공지 데이터셋'],['F3','고시 교차 확인'],['F4','관광 지점']]);
    for (const code of [...new Set(selected.map(s=>s.category))].sort()) {
      if (role !== 'candidate') rows.push(node('li',`${code} · ${names[code] || code}`,'directory-group'));
      rows.push(...selected.filter(s=>s.category===code).map(s=>directoryRow(s)));
    }
    $(`#${id}-directory`).replaceChildren(...(rows.length ? rows : [node('li', directoryEmpty(), 'meta')]));
  }
  const collectors = sources.filter(s => s.role === 'candidate' && s.kind !== 'static' && s.status !== 'static');
  const active = collectors.filter(s => s.status === 'active').length;
  const paused = collectors.filter(s => s.status === 'paused').length;
  const verified = sources.filter(s => s.boardVerified === true && sourceLink(s.listUrl, s)).length;
  $('#board-summary').textContent = slots.sources
    ? `수집 활성 ${active}곳 · 수집 중지 ${paused}곳 · 링크 안내 ${sources.length - collectors.length}곳 · 전체 출처 중 게시판 확인 ${verified}곳`
    : directoryEmpty();
  drawDistricts();
}

function drawHealth() {
  const h = slots.health;
  $('#collection-status').textContent = !h || timestamp(h.checkedAt) === null ? '첫 수집 점검 대기 · 발행일과 수집 시각은 다릅니다.' : `마지막 수집 점검 ${dateLabel(timestamp(h.checkedAt),true)} · 성공 ${number(h.succeeded)}곳 / 실패 ${number(h.failed)}곳`;
  $('#collection-status').classList.toggle('needs-review', Number(h?.failed)>0);
  $('#health-state').textContent = h
    ? `${failures.has('health') ? '최근 요청 실패 · 보관된 기록' : '수집 점검'} · ${dateLabel(timestamp(h.checkedAt), true)}`
    : failures.has('health') ? '점검 기록 대기 · 자료를 읽을 수 없습니다.' : '점검 기록 확인 중';
  const entries = [
    ['attempted', '시도'], ['succeeded', '성공'], ['failed', '실패'],
    ['paused', '중지'], ['newCount', '신규'], ['undated', '날짜 미확인'], ['duplicates', '중복']
  ];
  $('#health-metrics').replaceChildren(...(h ? entries.map(([key, label]) => {
    const pair = node('div');
    pair.append(node('dt', label), node('dd', number(h[key])));
    return pair;
  }) : []));
}

function drawStatus() {
  const index = slots.index;
  let message;
  if (archivePending) message = `보관 글 불러오는 중 · ${archive.size}/${index.length}개 파일 확인`;
  else if (!index) message = failures.has('index') ? '보관 목록 대기 · 색인을 읽을 수 없습니다.' : '보관 목록 확인 중';
  else if (archiveFailures) message = `보관 파일 ${archiveFailures}개 요청 실패 · 읽을 수 있는 글을 표시합니다.`;
  else if (failures.has('index')) message = '보관 색인 갱신 실패 · 기존 보관 목록을 표시합니다.';
  else message = index.length ? `보관 파일 ${index.length}개 확인 · 최신 목록과 중복을 제거했습니다.` : '보관 색인 확인 · 등록된 보관 파일 0개';
  $('#archive-state').textContent = message;
  const issues = [...failures.values()];
  if (archiveFailures) issues.push('보관 파일');
  $('#data-status').textContent = loading ? '자료 확인 중' : issues.length ? `${issues.join(' · ')} 확인 필요` : '자료 불러오기 완료';
  $('#retry').hidden = loading || !issues.length;
}

async function readJSON(path) {
  const res = await fetch(new URL(path, root), {
    mode: 'same-origin', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer'
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

async function readSlot(key, label, path, parse, render) {
  try {
    slots[key] = parse(await readJSON(path));
    failures.delete(key);
  } catch {
    failures.set(key, label);
  }
  render();
  drawStatus();
}

function parseSources(value) {
  if (!Array.isArray(value) || value.some(s => typeof s?.id !== 'string' || typeof s.name !== 'string')) {
    throw new Error('출처 형식 오류');
  }
  return value;
}

async function loadArchives() {
  await readSlot('index', '보관 색인', 'data/archive/index.json', archiveEntries, () => {});
  if (!slots.index) return;
  const files = slots.index;
  archivePending = files.length > 0;
  archiveFailures = 0;
  drawStatus();
  let cursor = 0;
  async function readNext() {
    while (cursor < files.length) {
      const file = files[cursor++];
      try {
        archive.set(file.path, archiveItems(await readJSON(file.path)));
      } catch {
        archiveFailures++;
      }
    }
  }
  await Promise.all([readNext(), readNext()]);
  if (!failures.has('index') && !archiveFailures) {
    const current = new Set(files.map(f => f.path));
    for (const path of archive.keys()) if (!current.has(path)) archive.delete(path);
  }
  archivePending = false;
  updateFeed();
  drawStatus();
}

async function load() {
  if (loading) return;
  loading = true;
  drawStatus();
  await Promise.all([
    readSlot('sources', '출처 목록', 'data/sources.json', parseSources, () => {
      drawDirectories();
      updateFeed();
    }),
    readSlot('live', '최신 글', 'data/notices.json', value => {
      if (!Array.isArray(value?.items)) throw new Error('글 목록 형식 오류');
      return value;
    }, updateFeed),
    readSlot('health', '점검 기록', 'data/health.json', value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('점검 기록 형식 오류');
      return value;
    }, drawHealth),
    loadArchives()
  ]);
  loading = false;
  drawFeed();
  drawStatus();
}

$('.filters').addEventListener('click', event => {
  const b = event.target.closest('button[data-group]');
  if (!b) return;
  filters[b.dataset.group] = b.dataset.value;
  limit = pageSize;
  drawFilters();
  drawFeed();
});
$('#title-search').addEventListener('input', event => {
  filters.query = event.target.value;
  limit = pageSize;
  drawFeed();
});
$('#reset').addEventListener('click', () => {
  Object.assign(filters, { source: '', category: '', query: '' });
  $('#title-search').value = '';
  limit = pageSize;
  drawFilters();
  drawFeed();
});
$('#district-search').addEventListener('input', drawDistricts);
$('#load-more').addEventListener('click', () => {
  const previous = limit;
  limit += pageSize;
  drawFeed(previous);
});
$('#retry').addEventListener('click', load);
window.addEventListener('hashchange', () => route(true));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) scheduleBadgeUpdates();
});
configureEmbed();
route();
drawFilters();
drawDirectories();
drawHealth();
load();

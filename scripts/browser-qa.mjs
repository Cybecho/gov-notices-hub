#!/usr/bin/env node
// Run after the Pages build: node scripts/browser-qa.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const mount = '/gov-notices-hub/';
const root = await realpath(fileURLToPath(new URL('../.site/', import.meta.url)));
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png', '.woff2': 'font/woff2' };
const inside = file => file.startsWith(root + path.sep);
const server = createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) return res.writeHead(405).end();
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!name.startsWith(mount)) return res.writeHead(404).end();
    const file = await realpath(path.resolve(root, name.slice(mount.length) + (name.endsWith('/') ? 'index.html' : '')));
    if (!inside(file) || !(await stat(file)).isFile()) return res.writeHead(404).end();
    const bytes = req.method === 'HEAD' ? undefined : await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).end(bytes);
  } catch { res.writeHead(404).end(); }
});
await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const home = origin + mount;
const atlasHarness = 'https://cybecho.github.io/__qa_parent__';

// Fail on attempted egress even though the route guard prevents it from succeeding.
async function scenario(browser, label, fixtures, run, width = 1280, embed = false) {
  const errors = [], seen = new Set();
  const appOrigin = embed ? new URL(atlasHarness).origin : origin;
  let pagesOpened = 0;
  const context = await browser.newContext({ viewport: { width, height: 850 }, serviceWorkers: 'block', locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  context.setDefaultTimeout(8000);
  context.on('page', p => {
    pagesOpened++;
    p.on('dialog', async dialog => { errors.push(`dialog: ${dialog.type()} ${dialog.message()}`); await dialog.dismiss(); });
    p.on('pageerror', err => errors.push(`page error: ${err.message}`));
  });
  context.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
  await context.routeWebSocket('**/*', ws => { errors.push(`WebSocket: ${ws.url()}`); ws.close(); });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (embed && url.href === atlasHarness && route.request().isNavigationRequest()) {
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset=utf-8><link rel="icon" href="data:,"><script>window.heights=[]; addEventListener('message', e => { if (e.origin === '${appOrigin}' && e.source === document.querySelector('iframe')?.contentWindow && e.data?.type === 'gov-hub:height') heights.push(e.data.height); });</script><iframe title=hub width="390" src="${appOrigin}${mount}?embed=atlas"></iframe>` });
    }
    if (url.origin !== appOrigin || !url.pathname.startsWith(mount)) {
      errors.push(`unexpected request: ${route.request().resourceType()} ${url.href}`);
      return route.abort();
    }
    const key = url.pathname.slice(mount.length);
    if (fixtures?.has(key)) {
      seen.add(key);
      return route.fulfill({ json: fixtures.get(key) });
    }
    if (fixtures && key.startsWith('data/') && key.endsWith('.json')) {
      errors.push(`unmocked data: ${key}`); return route.abort();
    }
    if (embed) {
      // Preserve the browser-visible HTTPS Pages URL without contacting a remote host.
      const response = await route.fetch({ url: origin + url.pathname + url.search, maxRedirects: 0 });
      try { return await route.fulfill({ response }); } finally { await response.dispose(); }
    }
    return route.continue();
  });
  try {
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(15000);
    await run(page, seen);
    await page.waitForLoadState('networkidle');
    assert.equal(pagesOpened, 1, 'unexpected popup');
    assert.deepEqual(errors, [], 'browser or network errors');
    console.log(`PASS ${label}`);
  } catch (cause) {
    throw new Error(`${label}: ${cause.message}${errors.length ? '\n' + errors.join('\n') : ''}`, { cause });
  } finally { await context.close(); }
}

async function original(link, url) {
  await link.waitFor({ state: 'visible' });
  assert.equal(await link.evaluate(el => el.href), url, 'original source URL');
  assert.equal(await link.getAttribute('target'), '_blank', 'original should open a new tab');
}
async function noContentEmbeds(scope) {
  assert.equal(await scope.locator('iframe, frame, object, embed').count(), 0, 'source content must not be embedded');
}
async function fitsViewport(scope) {
  assert.ok(await scope.locator('html').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'layout overflows viewport');
}

const kstDay = iso => new Date(Date.parse(iso) + 9 * 3600000).toISOString().slice(0, 10);
const isoHoursAgo = hours => new Date(Date.now() - hours * 3600000).toISOString();
async function sample() {
  // Start with the built public registry so role/category/source IDs match production.
  // These isolated HTTP response bodies never modify the registry on disk.
  const sources = JSON.parse(await readFile(path.join(root, 'data/sources.json'), 'utf8'));
  const candidates = sources.filter(s => s.role === 'candidate' && s.listUrl?.startsWith('https://'));
  const a = candidates[0], b = candidates.find(s => s.category !== a?.category);
  assert.ok(a && b, 'expected candidates from two research categories');
  for (const s of [a, b]) Object.assign(s, { status: 'active', lastError: null });
  const districts = sources.filter(s => s.role === 'district');
  assert.equal(districts.length, 25); assert.equal(new Set(districts.map(s => s.name)).size, 25);
  const verified = districts.find(s => s.boardVerified && s.listUrl);
  assert.ok(verified, 'expected a verified district in the public registry');
  const unknown = districts.find(s => s !== verified);
  Object.assign(unknown, { boardVerified: false, listUrl: null });
  const item = (key, title, source, published, fetched) => ({ id: `${source.id}-${published ? kstDay(published).replaceAll("-", "") : "00000000"}-001`, title, publishedAt: published, fetchedAt: isoHoursAgo(fetched), sourceId: source.id, sourceName: source.name, category: source.category, kind: source.itemKind, department: null, url: new URL(`/qa-${key}`, source.listUrl).href });
  const latest = item('latest', '여행 "원문" <em>표시</em> & 조사', a, isoHoursAgo(50), 49);
  const middle = item('middle', '숙박 동향 중간 조사', b, isoHoursAgo(24 * 90 - 1), 2);
  const undated = item('undated', '게시일 없는 여행 조사', a, null, -6);
  const archived = item('archive', '아카이브 여행 연구', b, isoHoursAgo(24 * 90), 24 * 88);
  // Put the archive overlap in the same KST month, including on month boundaries.
  const archiveDate = kstDay(archived.publishedAt);
  middle.publishedAt = new Date(archiveDate + "T18:00:00+09:00").toISOString();
  archived.publishedAt = new Date(archiveDate + "T09:00:00+09:00").toISOString();
  middle.id = `${b.id}-${archiveDate.replaceAll("-", "")}-002`;
  const month = kstDay(archived.publishedAt).slice(0, 7), archivePath = `data/archive/${month}.json`, updatedAt = isoHoursAgo(0);
  // Noncandidate data contamination must never surface as an hourly research post.
  const document = { ...item("district", "구청 고시공고 문서", verified, isoHoursAgo(1), 0), kind: "notice" };
  const fixtures = new Map([
    ['data/notices.json', { updatedAt, items: [undated, middle, document, latest] }],
    ['data/sources.json', sources],
    ['data/health.json', { checkedAt: updatedAt, attempted: 2, succeeded: 2, failed: 0, paused: sources.filter(s => s.status === 'paused').length, newCount: 1, undated: 1, duplicates: 0 }],
    ['data/archive/index.json', { files: [{ month, path: archivePath, count: 2 }] }],
    [archivePath, { updatedAt, items: [archived, { ...middle }] }],
  ]);
  return { a, b, latest, middle, undated, archived, month, archivePath, districts, verified, unknown, fixtures };
}

// The live and archive loads are concurrent. Wait for the UI's final success state,
// not merely the first article, which can appear before the archive is merged.
async function ready(scope) {
  await scope.locator('#data-status').filter({hasText: /^자료 불러오기 완료$/}).waitFor();
}
const articleLink = (scope, item) => scope.locator('#articles h3 a').filter({hasText:item.title});
async function assertFeed(page, items) {
  const rows = page.locator('#articles > li');
  assert.equal(await rows.count(), items.length, 'wrong timeline length');
  assert.deepEqual(await rows.locator('h3 a').evaluateAll(links => links.map(a => a.href)), items.map(i => i.url), 'unexpected timeline order or non-research link');
}
async function panel(page, id, name) {
  const nav = page.locator(`#navigation a[href="#${id}"]`);
  await nav.focus(); await page.keyboard.press('Enter');
  const heading = page.getByRole('heading', {level:1, name, exact:true});
  await heading.waitFor();
  assert.equal(await nav.getAttribute('aria-current'), 'page');
  assert.ok(await heading.evaluate(h => h === document.activeElement), 'focus should follow keyboard navigation');
}
async function desktop(page, seen, f) {
  await page.goto(home); await ready(page);
  await page.getByRole('heading', {level:1, name:'리서치 글 모음', exact:true}).waitFor();
  const all = [f.latest, f.middle, f.archived, f.undated];
  await assertFeed(page, all);
  for (const item of all) {
    const link = articleLink(page, item);
    await original(link, item.url);
    const rel = (await link.getAttribute('rel') || '').split(/\s+/);
    assert.ok(rel.includes('noopener') && rel.includes('noreferrer'));
    const row = page.locator('#articles > li').filter({has:page.getByRole('link').filter({hasText:item.title})});
    assert.equal(await row.locator('.badge').innerText(), item.sourceName);
    assert.equal(await row.getByText('NEW', {exact:true}).count(), Number(item === f.middle), `NEW must use first fetch time: ${item.id}`);
    if (item.publishedAt) {
      const date = row.locator("time");
      assert.equal(await date.getAttribute("datetime"), item.publishedAt);
      const label = new Intl.DateTimeFormat("ko-KR", {timeZone:"Asia/Seoul", year:"numeric", month:"long", day:"numeric"}).format(new Date(item.publishedAt));
      assert.equal(await date.innerText(), label + " KST");
    }
    else await row.getByText('날짜 미확인', {exact:true}).waitFor();
  }
  assert.equal(await articleLink(page, f.latest).locator('em').count(), 0, 'quoted title must not become markup');
  assert.match(await page.locator('#archive-state').innerText(), /보관 파일 1개 확인/);
  const chip = (group, value) => page.locator(`button[data-group="${group}"][data-value="${value}"]`);
  await chip('source', f.a.id).press('Enter');
  assert.equal(await chip('source', f.a.id).getAttribute('aria-pressed'), 'true');
  await assertFeed(page, [f.latest, f.undated]);
  const refreshed=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/data/notices.json') && new URL(r.url()).searchParams.has('edition'));
  await page.getByRole('button',{name:'허브 목록 새로 확인'}).click(); await refreshed; await ready(page);
  assert.equal(await chip('source', f.a.id).getAttribute('aria-pressed'), 'true');
  await assertFeed(page,[f.latest,f.undated]);
  await chip('source', '').click(); await chip('category', f.b.category).click();
  await assertFeed(page, [f.middle, f.archived]);
  await page.getByRole('searchbox', {name:'제목 검색'}).fill('QA-일치하지-않는-검색어');
  await assertFeed(page, []);
  assert.match(await page.locator('#feed-state').innerText(), /검색 조건과 일치하는 글이 없습니다/);
  await page.getByRole('button', {name:'초기화', exact:true}).click(); await assertFeed(page, all);
  for (const key of f.fixtures.keys()) assert.ok(seen.has(key), `missing data request: ${key}`);
  await panel(page, 'boards', '원문 게시판');
  await panel(page, 'districts', '서울 25개 구청 게시판');
  const rows = page.locator('#district-directory > li');
  assert.equal(await rows.count(), 25);
  const names = await rows.getByRole('heading', {level:3}).allTextContents();
  assert.deepEqual(names.map(n => n.replace(/ ↗$/, '')).sort(), f.districts.map(s => s.name).sort());
  const search = page.getByRole('searchbox', {name:'구청 찾기'});
  await search.fill(f.verified.name);
  const verified = rows.filter({has:page.getByRole('heading', {name:`${f.verified.name} ↗`, exact:true})});
  await original(verified.getByRole('link'), new URL(f.verified.listUrl).href);
  assert.match(await verified.locator('small').innerText(), /게시판 확인/);
  await search.fill(f.unknown.name);
  const unknown = rows.filter({has:page.getByRole('heading', {name:f.unknown.name, exact:true})});
  assert.match(await unknown.locator('small').innerText(), /게시판 미확인/);
  assert.equal(await unknown.getByRole('link').count(), 0);
  await panel(page, 'dashboards', '대시보드·보조 데이터');
  await panel(page, 'notes', '조사 노트와 권리');
  const health = f.fixtures.get('data/health.json');
  for (const [key, label] of Object.entries({attempted:'시도', succeeded:'성공', failed:'실패', paused:'중지'})) {
    const metric = page.locator('#health-metrics > div').filter({has:page.getByText(label, {exact:true})});
    assert.equal(await metric.locator('dd').innerText(), String(health[key]));
  }
  await noContentEmbeds(page);
}
async function smallScreens(browser, f) {
  await scenario(browser, 'mobile 390px', f.fixtures, async page => {
    await page.goto(home); await ready(page);
    await original(articleLink(page, f.latest), f.latest.url); await fitsViewport(page);
    await page.getByRole('link', {name:'구청 게시판', exact:true}).click();
    await page.getByRole('searchbox', {name:'구청 찾기'}).fill(f.verified.name);
    await fitsViewport(page); await noContentEmbeds(page);
  }, 390);
  await scenario(browser, 'Atlas embed reports content height', f.fixtures, async page => {
    await page.goto(atlasHarness);
    const frame = page.frameLocator('iframe[title="hub"]'); await ready(frame);
    await original(articleLink(frame, f.middle), f.middle.url);
    await original(frame.locator('#standalone'), new URL(mount + '#timeline', atlasHarness).href);
    assert.ok(await frame.locator('.masthead').isHidden()); await noContentEmbeds(frame);
    await page.waitForFunction(() => window.heights.some(h => Number.isInteger(h) && h > 0), null, {timeout:8000});
  }, 390, true);
}
async function smoke(browser) {
  const { items } = JSON.parse(await readFile(path.join(root, 'data/notices.json'), 'utf8'));
  const { files } = JSON.parse(await readFile(path.join(root, 'data/archive/index.json'), 'utf8'));
  await scenario(browser, 'unmocked built Pages dataset', null, async page => {
    await page.goto(home); await ready(page);
    await page.getByRole('heading', {name:'리서치 글 모음', level:1, exact:true}).waitFor();
    if (!items.length && files.every(file => file.count === 0)) {
      await assertFeed(page, []);
      assert.match(await page.locator('#feed-state').innerText(), /현재 불러온 자료에 리서치 글이 없습니다/);
    } else {
      await page.locator('#articles h3 a').first().waitFor();
      if (items.length) {
        await page.getByRole('searchbox', {name:'제목 검색'}).fill(items[0].title);
        await original(page.locator('#articles h3 a').filter({hasText:items[0].title}).and(page.locator(`a[href=${JSON.stringify(items[0].url)}]`)), items[0].url);
      }
    }
    await noContentEmbeds(page);
  });
}
let browser;
try {
  browser = await chromium.launch({headless:true,...(process.env.HUB_CHROME==='/usr/bin/google-chrome'?{executablePath:process.env.HUB_CHROME}:{})});
  if (!process.argv.includes('--smoke')) {
    const f = await sample();
    await scenario(browser, 'desktop timeline, archive, filters, keyboard and directories', f.fixtures, (p, seen) => desktop(p, seen, f));
    await smallScreens(browser, f);
  }
  await smoke(browser);
} finally {
  try { await browser?.close(); } finally { await new Promise(resolve => server.close(resolve)); }
}

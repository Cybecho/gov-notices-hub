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
const legacyOnly = new Map();
const unavailable = Symbol('intentional local fetch failure');
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
    if (fixtures === legacyOnly && key === 'data/reader.json') return route.abort('failed');
    if (fixtures?.has(key)) {
      seen.add(key);
      if (fixtures.get(key) === unavailable) return route.abort('failed');
      return route.fulfill({ json: fixtures.get(key) });
    }
    if (fixtures && fixtures !== legacyOnly && key.startsWith('data/') && key.endsWith('.json')) {
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
    ['data/reader.json', unavailable],
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
async function ready(scope, fallback = false) {
  if (fallback) {
    await scope.locator('#data-status').filter({hasText:/통합 목록 확인 필요/}).waitFor({state:'attached'});
    await scope.locator('#feed-state').filter({hasText:/기존 공지·보관 자료로 대신/}).waitFor({state:'attached'});
    return;
  }
  await scope.locator('#data-status').filter({hasText: /^자료 불러오기 완료$/}).waitFor({state:'attached'});
}
async function openFilters(page) {
  const panel = page.locator('#filter-panel');
  if (await panel.count() && !(await panel.evaluate(el => el.open))) {
    await panel.locator('summary').press('Enter');
    assert.ok(await panel.evaluate(el => el.open));
  }
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
  await page.goto(home); await ready(page, true);
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
    assert.equal(await row.locator('.fresh').count(), Number(item === f.middle), `NEW must use first fetch time: ${item.id}`);
    if (item.publishedAt) {
      const date = row.locator("time");
      assert.equal(await date.getAttribute("datetime"), item.publishedAt);
      const label = new Intl.DateTimeFormat("ko-KR", {timeZone:"Asia/Seoul", year:"numeric", month:"long", day:"numeric"}).format(new Date(item.publishedAt));
      assert.equal(await date.innerText(), label + " KST");
    }
    else await row.getByText('발행일 미확인', {exact:true}).waitFor();
  }
  assert.equal(await articleLink(page, f.latest).locator('em').count(), 0, 'quoted title must not become markup');
  assert.match(await page.locator('#archive-state').innerText(), /보관 파일 1개 확인/);
  const chip = (group, value) => page.locator(`button[data-group="${group}"][data-value="${value}"]`);
  await openFilters(page);
  await chip('source', f.a.id).press('Enter');
  assert.equal(await chip('source', f.a.id).getAttribute('aria-pressed'), 'true');
  await assertFeed(page, [f.latest, f.undated]);
  const refreshed=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/data/notices.json') && new URL(r.url()).searchParams.has('edition'));
  await page.getByRole('button',{name:'허브 목록 새로 확인'}).click(); await refreshed; await page.waitForLoadState('networkidle'); await ready(page, true); await openFilters(page);
  assert.equal(await chip('source', f.a.id).getAttribute('aria-pressed'), 'true');
  await assertFeed(page,[f.latest,f.undated]);
  await chip('source', '').click(); await chip('category', f.b.category).click();
  await assertFeed(page, [f.middle, f.archived]);
  await page.locator('#title-search').fill('QA-일치하지-않는-검색어');
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
    await page.goto(home); await ready(page, true);
    await original(articleLink(page, f.latest), f.latest.url); await fitsViewport(page);
    await page.getByRole('link', {name:'구청 게시판', exact:true}).click();
    await page.getByRole('searchbox', {name:'구청 찾기'}).fill(f.verified.name);
    await fitsViewport(page); await noContentEmbeds(page);
  }, 390);
  await scenario(browser, 'Atlas embed reports content height', f.fixtures, async page => {
    await page.goto(atlasHarness);
    const frame = page.frameLocator('iframe[title="hub"]'); await ready(frame, true);
    await original(articleLink(frame, f.middle), f.middle.url);
    await original(frame.locator('#standalone'), new URL(mount + '#timeline', atlasHarness).href);
    assert.ok(await frame.locator('.masthead').isHidden()); await noContentEmbeds(frame);
    await page.waitForFunction(() => window.heights.some(h => Number.isInteger(h) && h > 0), null, {timeout:8000});
  }, 390, true);
}
async function legacySmoke(browser) {
  const { items } = JSON.parse(await readFile(path.join(root, 'data/notices.json'), 'utf8'));
  const { files } = JSON.parse(await readFile(path.join(root, 'data/archive/index.json'), 'utf8'));
  await scenario(browser, 'built notices fallback', legacyOnly, async page => {
    await page.goto(home); await ready(page,true);
    await page.getByRole('heading', {name:'리서치 글 모음', level:1, exact:true}).waitFor();
    if (!items.length && files.every(file => file.count === 0)) {
      await assertFeed(page, []);
      assert.match(await page.locator('#feed-state').innerText(), /현재 불러온 자료에 리서치 글이 없습니다/);
    } else {
      await page.locator('#articles h3 a').first().waitFor();
      if (items.length) {
        await page.locator('#title-search').fill(items[0].title);
        await original(page.locator('#articles h3 a').filter({hasText:items[0].title}).and(page.locator(`a[href=${JSON.stringify(items[0].url)}]`)), items[0].url);
      }
    }
    await noContentEmbeds(page);
  });
}

const chipFor = (page, id) => page.locator('button[data-group="source"][data-value=' + JSON.stringify(id) + ']');
const searchFor = page => page.locator('#title-search');
const directRows = page => page.locator('#articles > li[data-kind="direct"]');
const catalogRows = page => page.locator('#articles > li[data-kind="catalog"]');

function readerFixture(f) {
  const sources = f.fixtures.get('data/sources.json').filter(s => s.role === 'candidate');
  const issuers = ['opensurvey-blog','jll','cw'].map(id => sources.find(s => s.id === id));
  const updatedAt = isoHoursAgo(0);
  const items = Array.from({length:41}, (_, i) => {
    const s = issuers[i % issuers.length];
    const url = 'https://' + s.id + '.example.org/story/' + (1000 + i);
    return {id:s.id + '-qa-' + i, sourceId:s.id, sourceName:s.name, category:s.category, kind:s.itemKind || 'report',
      title:(i === 40 ? '게시일 미확인' : '서울 숙박 연구') + ' QA ' + String(i).padStart(2, '0'),
      url, publishedAt:i === 40 ? null : isoHoursAgo(96 + i * 24), fetchedAt:isoHoursAgo(36),
      method:i % 3 === 0 ? 'hourly' : 'reference', linkKind:s.id === 'cw' ? 'release' : 'article',
      verifiedAt:i % 3 === 0 ? null : '2026-01-10', evidenceUrl:i % 3 === 0 ? null : url};
  });
  const coverage = sources.map(s => {
    const selected = items.filter(i => i.sourceId === s.id);
    return {sourceId:s.id, count:selected.length, automatic:selected.filter(i => i.method === 'hourly').length,
      reference:selected.filter(i => i.method === 'reference').length,index:0,status:s.status};
  });
  const fixtures = new Map(f.fixtures);
  fixtures.set('data/reader.json', {schema:'seoul-links-reader/2', updatedAt, items, coverage,
    catalogEntries:[], highlights:[], discovery:{checkedAt:updatedAt,channels:[],providers:[]}});
  return {fixtures,items,sources};
}
async function checkSourceControls(page, sources) {
  await openFilters(page);
  assert.equal(sources.length, 15);
  const controls = page.locator('button[data-group="source"]');
  assert.deepEqual((await controls.evaluateAll(bs => bs.map(b => b.dataset.value))).sort(), ['', ...sources.map(s=>s.id)].sort());
  for (const s of sources) {
    const control = chipFor(page,s.id);
    assert.ok(await control.isVisible() && await control.isEnabled(), 'inaccessible channel: ' + s.id);
  }
}
async function matchingTitle(rowList,item,url = item.url) {
  assert.equal(new URL(url).protocol,'https:');
  const row = rowList.filter({has:rowList.page().locator('h3 a').filter({hasText:item.title})});
  const link = row.locator('h3 a').and(rowList.page().locator('a[href=' + JSON.stringify(url) + ']'));
  assert.equal(await link.count(),1,'expected a distinct clickable title for ' + item.title);
  assert.equal(await link.evaluate(el=>[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('').trim()), item.title, 'exact story title');
  await original(link,url);
  return row.filter({has:rowList.page().locator('h3 a[href=' + JSON.stringify(url) + ']')});
}
async function readerScenario(page, seen, f, mobile) {
  await page.goto(home); await ready(page);
  assert.ok(seen.has('data/reader.json'));
  const rows = directRows(page);
  const shown = await rows.count();
  assert.ok(shown > 1 && shown < f.items.length, 'first page must contain a bounded slice');
  await assertFeed(page,f.items.slice(0,shown));
  assert.ok(new Set(f.items.slice(0,shown).map(i=>i.sourceId)).size > 1);
  await page.locator('#load-more').press('Enter');
  assert.ok(await rows.count() > shown,'next page appends articles');
  assert.ok(await rows.nth(shown).evaluate(el => el.contains(document.activeElement)),'keyboard focus should follow pagination');
  for (let i = 0; i < f.items.length && await page.locator('#load-more').isVisible(); i++) await page.locator('#load-more').click();
  await assertFeed(page,f.items);
  await rows.last().getByText('발행일 미확인',{exact:true}).waitFor();
  assert.equal(await rows.last().locator('time.date').count(),0,'never substitute fetched/verified date');
  await checkSourceControls(page,f.sources);
  assert.equal(await chipFor(page,'').locator('.chip-count').innerText(),String(f.items.length));
  await chipFor(page,'cw').press('Enter');
  const releases=f.items.filter(i=>i.sourceId==='cw');
  await assertFeed(page,releases);
  await searchFor(page).fill(releases[0].title);
  await assertFeed(page,[releases[0]]); await matchingTitle(rows,releases[0]);
  await page.locator('#reset').click();
  await fitsViewport(page); await noContentEmbeds(page);
  if (mobile) assert.equal(await page.evaluate(()=>window.innerWidth),390);
}
async function smoke(browser) {
  const read = async name => JSON.parse(await readFile(path.join(root,'data',name),'utf8'));
  const bundle = await read('reader.json'), sources = (await read('sources.json')).filter(s=>s.role==='candidate');
  assert.equal(bundle.schema,'seoul-links-reader/2');
  assert.deepEqual(bundle.coverage.map(s=>s.sourceId).sort(),sources.map(s=>s.id).sort());
  const items=bundle.items, entries=bundle.catalogEntries;
  const direct = new Set(items.map(i=>i.url));
  assert.ok(direct.size > 15 && new Set(items.map(i=>i.sourceId)).size > 1,'real cross-publisher depth');
  assert.equal(direct.size,items.length,'repeated story URL is not another article');
  const identifiers = new Set(entries.map(e=>JSON.stringify([e.sourceId,e.identifier])));
  assert.ok(identifiers.size,'production must retain official-index records');
  assert.equal(identifiers.size,entries.length,'do not count the same official list record twice');
  await scenario(browser,'unmocked built reader, 15 channels and official catalog',null,async page=>{
    await page.goto(home); await ready(page); await checkSourceControls(page,sources);
    const directList=directRows(page), catalogList=catalogRows(page);
    const initial=await page.locator('#articles h3 a').evaluateAll(as=>as.map(a=>a.href));
    assert.ok(initial.length && initial.some(url=>direct.has(url)),'default page includes direct stories');
    const summary=await page.locator('#result-count').innerText();
    assert.ok(summary.includes('개별 원문 '+direct.size.toLocaleString('ko-KR')) && summary.includes('공식 목록 항목 '+identifiers.size.toLocaleString('ko-KR')), 'report direct and official-index totals separately');
    const directSources = new Map(items.map(i=>[i.url,i]));
    let visibleDirect = initial.map(url=>directSources.get(url)).filter(Boolean);
    // A prolific publisher can fill the first page. Verify the unfiltered
    // timeline reaches multiple publishers and a non-hourly record via More.
    for(let offset=initial.length; offset<items.length+entries.length &&
      (new Set(visibleDirect.map(i=>i.sourceId)).size<2 || visibleDirect.every(i=>i.method==='hourly'));) {
      const more=page.locator('#load-more');
      if (!await more.isVisible()) break;
      await more.click();
      const links=await page.locator('#articles h3 a').evaluateAll(as=>as.map(a=>a.href));
      assert.ok(links.length>offset,'default pagination must advance');
      offset=links.length; visibleDirect=links.map(url=>directSources.get(url)).filter(Boolean);
    }
    assert.ok(new Set(visibleDirect.map(i=>i.sourceId)).size>1 && visibleDirect.some(i=>i.method!=='hourly'),'default feed must include non-hourly stories alongside other publishers');
    for(const s of sources) {
      const count=items.filter(i=>i.sourceId===s.id).length + entries.filter(i=>i.sourceId===s.id).length;
      assert.equal(await chipFor(page,s.id).locator('.chip-count').innerText(),count.toLocaleString('ko-KR'),'wrong count for '+s.id);
      await chipFor(page,s.id).press('Enter');
      assert.equal(await chipFor(page,s.id).getAttribute('aria-pressed'),'true');
      const shown=await page.locator('#articles > li').evaluateAll(ls=>ls.map(li=>li.dataset.source));
      assert.equal(Boolean(shown.length),Boolean(count));
      assert.ok(shown.every(id=>id===s.id),'source filter leaked unrelated rows');
    }
    assert.equal(await chipFor(page,'').locator('.chip-count').innerText(),(direct.size+entries.length).toLocaleString('ko-KR'));
    for(const id of ['yanolja-brief','sto-survey','cw','consumerinsight-pr','opensurvey-blog']) {
      const item = items.find(i=>i.sourceId===id && (id!=='cw' || (i.linkKind==='release' && new URL(i.url).hostname==='www.newswire.co.kr')));
      assert.ok(item,'missing published direct story for '+id);
      await openFilters(page); await chipFor(page,id).click(); await searchFor(page).fill(item.title);
      await matchingTitle(directList,item);
      await searchFor(page).fill('');
    }
    const entry=entries.find(e=>e.sourceId==='yanolja-download');
    assert.ok(entry?.listUrl && entry.title,'missing official dataset index entry');
    await openFilters(page); await chipFor(page,entry.sourceId).click(); await searchFor(page).fill(entry.title);
    const row=await matchingTitle(catalogList,entry,entry.listUrl);
    assert.match(await row.innerText(),/공식 목록/);
    assert.equal(await directList.locator('h3 a[href='+JSON.stringify(entry.listUrl)+']').count(),0,'board is not a direct story');
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
    const v2 = readerFixture(f);
    for (const width of [1280,390]) await scenario(browser, 'v2 reader at '+width+'px', v2.fixtures, (p,seen)=>readerScenario(p,seen,v2,width===390),width);
  }
  await legacySmoke(browser);
  await smoke(browser);
} finally {
  try { await browser?.close(); } finally { await new Promise(resolve => server.close(resolve)); }
}

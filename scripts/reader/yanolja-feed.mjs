import { load } from 'cheerio';
import robotsParser from 'robots-parser';

const origin = 'https://yanoljaresearch.blogspot.com';
const robots = `${origin}/robots.txt`;
const feed = `${origin}/feeds/posts/default`;
const blogId = 'tag:blogger.com,1999:blog-7635182884745409612';
const atom = 'http://www.w3.org/2005/Atom';
const channels = ['yanolja-trend', 'yanolja-insight', 'yanolja-brief'];
const labels = new Map([
  ['Yanolja Research Korean Lodging Trends', 'trend'],
  ['Yanolja Research Insights', 'insight'],
  ['Yanolja Research Brief', 'brief'],
]);
const clean = text => text.replace(/\s+/gu, ' ').trim();
const vol = text => text.match(/\bVol\.\s*(\d+)\b/i)?.[1];
const quarter = text => text.match(/\bQ[1-4] 20\d{2}\b/i)?.[0].toUpperCase();
const slug = /^https:\/\/yanoljaresearch\.blogspot\.com\/20\d{2}\/(?:0[1-9]|1[0-2])\/[a-z0-9][a-z0-9_-]*\.html$/;
const detail = /^https:\/\/www\.yanolja-research\.com\/(brief|insight|trend)\/view\/([1-9]\d*)(?:\?lang=(?:en|kr|ko))?$/;
// These individual original works were issued as briefs despite their later Insights label.
const historical = new Map([
  ['2023/11/yanolja-research-insights-vol9-airbnbs.html', 'yanolja:insight:34'],
  ['2025/03/yanolja-research-insights-vol6-trends.html', 'yanolja:insight:22'],
  ['2025/03/yanolja-research-insights-vol4-what.html', 'yanolja:insight:14'],
]);

function series(title, terms) {
  if ([title, ...terms].some(s => /\bData Snapshot\b/i.test(s))) return;
  const scopes = new Set(terms.map(t => labels.get(t)).filter(Boolean));
  const name = title.match(/^\[Yanolja Research (Brief|Insights?|Korean Lodging Trends)(?=\]|\s+Vol\.)/i)?.[1].toLowerCase();
  const scope = name === 'korean lodging trends' ? 'trend' : name?.replace(/^insights$/, 'insight');
  if (!scope || (terms.length && (!scopes.has(scope) || scopes.size !== 1))) return;
  if (scope === 'trend' ? !quarter(title) : !vol(title)) return;
  return scope;
}

function original(content, title, scope) {
  if (content.length !== 1 || content.attr('type') !== 'html') return;
  const html = load(content.text(), {}, false);
  // Only links embedded by the publisher count. Never treat prose, bare URLs, assets,
  // references to another volume, or a guessed volume-to-ID relationship as originals.
  html('script,style,template,noscript,[hidden]').remove();
  const keys = new Set();
  let declared = false;
  for (const a of html('a[href]').toArray()) {
    const m = detail.exec(html(a).attr('href'));
    if (!m) continue;
    keys.add(`yanolja:${m[1]}:${m[2]}`);
    const label = clean(html(a).text());
    if (m[1] !== scope) continue;
    if (scope === 'trend') {
      declared ||= /Korean Lodging Industry Trends Report/i.test(label) && quarter(label) === quarter(title);
    } else {
      const kind = scope === 'brief' ? /\bbrief\b/i : /\binsights?\b/i;
      const subtitle = s => s.replace(/^.*?\bVol\.\s*\d+/i, '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
      declared ||= kind.test(label) && vol(label) === vol(title) && !!subtitle(title) && subtitle(label) === subtitle(title);
    }
  }
  if (declared && keys.size === 1) return [...keys][0];
}

function editionDay(raw) {
  const m = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(raw);
  if (!m) return;
  const day = new Date(m[1] + 'T00:00:00Z');
  const time = Date.parse(raw);
  if (!Number.isFinite(+day) || day.toISOString().slice(0, 10) !== m[1] || !Number.isFinite(time)) return;
  return new Date(time + 9 * 3600000).toISOString().slice(0, 10);
}

// The parent schedules and persists the hourly limit and provides redirect-refusing,
// credential-free GET transport. Backfill (first) intentionally shares the same budget.
export async function collectYanolja({ request, first, now }) {
  const rules = await request(robots, 'robots');
  if (typeof rules !== 'string' || !/^\s*user-agent\s*:/im.test(rules) || /<\s*[!?a-z]/i.test(rules) ||
      robotsParser(robots, rules).isAllowed(feed, 'SeoulResearchLinks') !== true) throw new Error('Blogger robots not verified or feed disallowed');
  const xml = await request(feed, 'xml');
  if (typeof xml !== 'string' || !/<\/feed>\s*$/.test(xml) || /<!DOCTYPE/i.test(xml)) throw new Error('Invalid Blogger Atom envelope');
  const $ = load(xml, { xml: true });
  const root = $.root().children();
  const alt = node => node.children('link[rel="alternate"][type="text/html"]');
  if (root.length !== 1 || !root.is('feed') || root.attr('xmlns') !== atom || root.children('id').text() !== blogId ||
      root.children('title').text() !== 'Yanolja Research' || alt(root).length !== 1 || alt(root).attr('href') !== origin + '/') throw new Error('Unexpected Blogger Atom identity');
  const items = [], seen = new Set();
  let unclassified = 0;
  for (const node of root.children('entry').toArray()) {
    const entry = $(node);
    const title = clean(entry.children('title').text());
    const terms = entry.children('category').map((_, c) => $(c).attr('term')).get();
    const scope = series(title, terms);
    const url = alt(entry).attr('href');
    const publishedAt = editionDay(entry.children('published').text());
    if (!scope || !url || alt(entry).length !== 1 || !slug.test(url) || !publishedAt ||
        entry.children('title').length !== 1 || entry.children('title').children().length ||
        (entry.attr('xmlns') && entry.attr('xmlns') !== atom)) { unclassified++; continue; }
    if (seen.has(url)) continue;
    seen.add(url);
    const workKey = original(entry.children('content'), title, scope);
    const legacyKey = historical.get(url.slice(origin.length + 1));
    const sourceId = 'yanolja-' + (legacyKey && legacyKey === workKey ? 'brief' : scope);
    items.push({ sourceId, title, url, publishedAt, linkKind: 'release', evidenceUrl: feed, ...(workKey && (!legacyKey || legacyKey === workKey) ? { workKey } : {}) });
  }
  return { pages: 1, items, channels: [...channels], unclassified };
}

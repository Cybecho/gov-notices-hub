import { load } from 'cheerio';
const origin = 'https://blog.opensurvey.co.kr';
const listing = /^\/category\/trendreport\/(?:page\/[1-9]\d*\/)?$/;
function link(raw, base, path) {
  if (!raw) return null;
  try {
    const u = new URL(raw, base);
    return u.origin === origin && !u.username && !u.password && !u.search && !u.hash && path.test(u.pathname) ? u.href : null;
  } catch { return null; }
}
function date(raw) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const t = new Date(raw + 'T00:00:00Z');
  return Number.isFinite(+t) && t.toISOString().slice(0,10) === raw ? raw : null;
}
export function parse(source, body, listUrl) {
  const items = [], empty = {items, nextUrl:null};
  if ((source?.id ?? source) !== 'opensurvey-blog' || (source?.status && source.status !== 'active') || !link(listUrl,origin,listing)) return empty;
  const $ = load(body), seen = new Set();
  for (const a of $('a.post-link[href]').toArray()) {
    const title = $(a).find('.post-item-title').first().text().replace(/\s+/g,' ').trim();
    if (!/(여행|숙박|관광|호텔|리조트|휴가|호캉스|항공권)/u.test(title) || !/(리포트|보고서)/u.test(title)) continue;
    const url = link($(a).attr('href'),listUrl,/^\/trendreport\/[a-z0-9-]+\/$/i);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    items.push({title,url,publishedAt:date($(a).find('.post-item-date').first().text().trim())});
  }
  const nextUrl = link($('link[rel~="next"][href], a.next.page-numbers[href]').first().attr('href'),listUrl,listing);
  return {items,nextUrl:nextUrl !== listUrl ? nextUrl : null};
}

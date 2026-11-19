import test from 'node:test';
import assert from 'node:assert/strict';
import { collectYanolja } from './yanolja-feed.mjs';

const home = 'https://yanoljaresearch.blogspot.com';
const feed = home + '/feeds/posts/default';
const robots = home + '/robots.txt';
const allowed = 'User-agent: *\nDisallow: /search\nAllow: /';
const site = 'https://www.yanolja-research.com';
const link = (href, label) => `<a href="${href}">${label}</a>`;
const brief = '[Yanolja Research Brief] Vol.18 Example';
const normalUrl = home + '/2026/11/yanolja-research-brief-vol18-analysis.html';
function entry({ title = brief, terms = ['Yanolja Research Brief'], url = normalUrl,
  date = '2026-11-09T16:30:00Z', body = '', extra = '' } = {}) {
  return `<entry><title type="text">${title}</title>${terms.map(t => `<category term="${t}"/>`).join('')}
    <link rel="alternate" type="text/html" href="${url}"/><published>${date}</published>
    <updated>2026-11-20T12:00:00+09:00</updated><content type="html"><![CDATA[${body}]]></content>${extra}</entry>`;
}
function envelope(entries) {
  return `<feed xmlns="http://www.w3.org/2005/Atom"><id>tag:blogger.com,1999:blog-7635182884745409612</id><title>Yanolja Research</title>
    <link rel="alternate" type="text/html" href="${home}/"/><link rel="next" href="https://www.blogger.com/feeds/7635182884745409612/posts/default?start-index=26"/>${entries}</feed>`;
}
function collect(xml, rules = allowed, calls = []) {
  return collectYanolja({ first: true, now: '2026-11-20T00:00:00Z', request: async (...args) => {
    calls.push(args);
    if (args[0] === robots && args[1] === 'robots') return rules;
    if (args[0] === feed && args[1] === 'xml') return xml;
    assert.fail('Unexpected request');
  } });
}

test('one page; issued alternate and edition date, not updated, URL month or original date', async () => {
  const calls = [];
  const e = entry({ body: 'Do not copy me ' + link(site + '/brief/view/1005?lang=en', '[YR] BRIEF Vol.18. Example') });
  const r = await collect(envelope(e + e), allowed, calls);
  assert.deepEqual(calls, [[robots, 'robots'], [feed, 'xml']]);
  assert.deepEqual(r, { pages: 1, channels: ['yanolja-trend', 'yanolja-insight', 'yanolja-brief'], unclassified: 0,
    items: [{ sourceId: 'yanolja-brief', title: brief, url: normalUrl, publishedAt: '2026-11-10', linkKind: 'release', evidenceUrl: feed, workKey: 'yanolja:brief:1005' }] });
});

test('positive trend, singular older Insight and specific original historical brief', async () => {
  const entries = [
    { title: '[Yanolja Research Korean Lodging Trends] Korean Lodging Industry Trends Report for Q3 2026', terms: ['Yanolja Research Korean Lodging Trends'], url: home + '/2026/10/trends.html', body: link(site + '/trend/view/998?lang=en', 'Korean Lodging Industry Trends Report for Q3 2026') },
    { title: '[Yanolja Research Insight Vol. 30] Example', terms: [], url: home + '/2025/10/example.html' },
    { title: '[Yanolja Research Insights] Vol.9 Example', terms: ['Yanolja Research Insights'], url: home + '/2023/11/yanolja-research-insights-vol9-airbnbs.html', body: link(site + '/insight/view/34?lang=en', 'Yanolja Research Insights Vol.9 Example') },
  ];
  const { items } = await collect(envelope(entries.map(entry).join('')));
  assert.deepEqual(items.map(i => [i.sourceId, i.workKey]), [['yanolja-trend', 'yanolja:trend:998'], ['yanolja-insight', undefined], ['yanolja-brief', 'yanolja:insight:34']]);
});

test('robots denials, bot-specific overrides and non-robots documents stop before the feed', async () => {
  for (const rules of ['User-agent: *\nDisallow: /', allowed + '\n\nUser-agent: SeoulResearchLinks\nDisallow: /feeds', '', '<html>User-agent: *</html>']) {
    const calls = [];
    await assert.rejects(collect('', rules, calls), /robots/);
    assert.deepEqual(calls, [[robots, 'robots']]);
  }
});

test('reject RSS, HTML, other blog identity, namespace and incomplete feed', async () => {
  const good = envelope(entry());
  for (const xml of ['<rss/>', `<html>${good}</html>`, good.replace('7635182884745409612', '123'), good.replace(home + '/"', 'https://other.example/"'), good.replace('2005/Atom', '2005/Other'), good.slice(0,-7)]) {
    await assert.rejects(collect(xml), /Atom/);
  }
});

test('snapshot overrides title or labels; unrelated, conflicting or body-only classification skipped', async () => {
  const rows = [{ title: '[YARI Data Snapshot] Example' }, { terms: ['Yanolja Research Brief', 'YARI Data Snapshot'] },
    { title: 'Interview Vol.18', body: brief }, { terms: ['Yanolja Research Insights'] },
    { terms: ['Yanolja Research Insights','Yanolja Research Brief'] }, { title: 'New Report', terms: [] }];
  const r = await collect(envelope(rows.map(entry).join('')));
  assert.deepEqual(r.items, []); assert.equal(r.unclassified, rows.length);
});

test('only unique edition alternates, strict dated Blogger paths and valid published timestamps', async () => {
  const rows = [ ...['http://yanoljaresearch.blogspot.com/2026/11/item.html', home + '.example/2026/11/item.html',
    home + '/2026/11/../item.html', home + '/2026/11/a.html?redirect=1', home + '/p/about.html',
    site + '/brief/view/1005', home + '/2026/13/bad.html', home + '/2026/11/a%2fb.html'].map(url => ({url})),
    { extra: `<link rel="alternate" type="text/html" href="${home}/2026/11/b.html"/>` },
    { date: '' }, { date: '2026-02-30T12:00:00Z' }, { date: '2026-11-10' } ];
  const r = await collect(envelope(rows.map(entry).join(''))); assert.deepEqual(r.items, []);
});

test('no identity inferred from URL text, hidden links, ambiguous originals, mismatched series or volume', async () => {
  const url = site + '/brief/view/1005?lang=en', label = '[YR] BRIEF Vol.18. Example';
  for (const body of [url, link(url, 'See another report'), link(url, 'Brief Vol.17'), link(url.replace('/brief/', '/trend/'), label),
    link(url, label) + link(url.replace('1005', '1006'), label), link(url.replace('.com/', '.com.example/'), label),
    link(url.replace('/brief/', '/about/../brief/'), label), `<template>${link(url, label)}</template>`]) {
    const r = await collect(envelope(entry({body}))); assert.equal(r.items.length, 1); assert.ok(!('workKey' in r.items[0]));
  }
});

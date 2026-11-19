import test from 'node:test';
import assert from 'node:assert/strict';
import { runSyndication, createReaderRequest } from './syndicate.mjs';

const initial = { schema: 'issuer-syndication/1', checkedAt: null, items: [], providers: [{ id: 'yanolja-blog-atom', status: 'pending', checkedAt: null, lastSuccessAt: null, lastFailureAt: null }] };
const t0 = '2026-11-20T10:00:00.000+09:00', t1 = '2026-11-20T11:00:00.000+09:00';
const origin = 'https://yanoljaresearch.blogspot.com', feed = origin + '/feeds/posts/default', robots = origin + '/robots.txt';
const item = { sourceId: 'yanolja-trend', title: 'A release', url: origin + '/2026/11/release.html', evidenceUrl: feed, publishedAt: '2026-11-01', linkKind: 'release' };
const result = { pages: 1, items: [item], unclassified: 2 };
const first = () => runSyndication(initial, { now: t0, collect: async args => { assert.equal(args.first, true); return result; } });

test('first observation and next eligible check of the same URL', async () => {
  const { state } = await first();
  assert.deepEqual(state.items, [{ ...item, fetchedAt: t0 }]);
  assert.equal(initial.items.length, 0);
  assert.deepEqual([state.providers[0].newCount, state.providers[0].seen, state.providers[0].unclassified, state.providers[0].pages], [1, 1, 2, 1]);
  const r = await runSyndication(state, { now: t1, collect: async args => { assert.equal(args.first, false); return { ...result, items: [{ ...item, title: 'Correction', body: 'must not persist' }] }; } });
  assert.deepEqual(r.state.items, [{ ...item, title: 'Correction', fetchedAt: t0 }]);
  assert.equal(r.state.providers[0].newCount, 0);
  assert.equal(r.state.providers[0].lastSuccessAt, t1);
});

test('failed check retains good metadata and only records a sanitized failure', async () => {
  const { state } = await first();
  const r = await runSyndication(state, { now: t1, collect: async () => { throw Error('private response text'); } });
  assert.deepEqual(r.state.items, state.items);
  const p = r.state.providers[0];
  assert.deepEqual([r.outcome, p.lastFailureAt, p.lastSuccessAt, p.checkedAt, p.seen, p.newCount, p.error], ['failed', t1, t0, t1, null, null, 'network-error']);
  assert.ok(!JSON.stringify(r).includes('private response text'));
  const recovery = await runSyndication(r.state, { now: '2026-11-20T12:00:00.000+09:00', collect: async () => ({ ...result, items: [] }) });
  assert.equal(recovery.state.providers[0].lastFailureAt, t1);
  assert.deepEqual(recovery.state.items, state.items);
});

test('under an hour and paused checks do not call the collector or change state', async () => {
  const { state } = await first(); let calls = 0;
  const collect = () => { calls++; throw Error(); };
  const r = await runSyndication(state, { now: '2026-11-20T10:59:59.999+09:00', collect });
  assert.equal(r.outcome, 'skip-interval'); assert.equal(r.state, state);
  const blocked = await runSyndication(state, { now: t1, collect: () => { throw Error('Unexpected Blogger Atom identity'); } });
  assert.equal(blocked.outcome, 'paused');
  const later = await runSyndication(blocked.state, { now: '2027-01-01T00:00:00.000+09:00', collect });
  assert.equal(later.outcome, 'skip-paused'); assert.equal(later.state, blocked.state); assert.equal(calls, 0);
});

const response = (text, mime, status = 200) => new Response(text, { status, headers: { 'Content-Type': mime } });
const allowed = 'User-agent: *\nAllow: /\nCrawl-delay: 4';
test('only the reviewed two credentialless GETs, honest UA, no HTML and no pagination', async () => {
  const calls = [], waits = [];
  const request = createReaderRequest({ wait: async ms => waits.push(ms), fetcher: async (url, opts) => {
    calls.push([url, opts]); return url === robots ? response(allowed, 'text/plain; charset=utf-8') : response('<feed/>', 'application/atom+xml');
  } });
  await request(robots, 'robots'); await request(feed, 'xml');
  await assert.rejects(request(feed + '?page=2', 'xml')); await assert.rejects(request(feed, 'xml'));
  assert.deepEqual(calls.map(x => x[0]), [robots, feed]); assert.equal(waits.at(-1), 4000);
  for (const [, o] of calls) {
    assert.equal(o.redirect, 'manual'); assert.equal(o.credentials, 'omit'); assert.equal(o.method, 'GET');
    assert.match(o.headers['User-Agent'], /^SeoulResearchLinks\//); assert.doesNotMatch(o.headers.Accept, /html|\*/i);
  }
  assert.equal(calls[0][1].headers.Accept, 'text/plain'); assert.match(calls[1][1].headers.Accept, /application\/atom\+xml/);
});

test('unsafe delay, disallowed feed, redirects, auth, HTML and blocking statuses pause without retry', async () => {
  const fixtures = [
    [() => response('User-agent: *\nAllow: /\nCrawl-delay: 61', 'text/plain')],
    [() => response('User-agent: *\nDisallow: /feeds', 'text/plain')],
    [() => response('User-agent: *', 'text/html')],
    ...[301, 401, 403, 407, 410, 429].map(n => [() => response(allowed, 'text/plain'), () => response('private', 'text/plain', n)]),
    [() => response(allowed, 'text/plain'), () => response('login', 'text/html')],
  ];
  for (const replies of fixtures) {
    let count = 0;
    const request = createReaderRequest({ wait: async () => {}, fetcher: async () => replies[count++]() });
    const r = await runSyndication(initial, { now: t0, request });
    assert.equal(r.outcome, 'paused'); assert.equal(count, replies.length); assert.equal(r.state.providers[0].seen, null);
  }
});

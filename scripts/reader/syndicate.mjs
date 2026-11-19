import { appendFile } from 'node:fs/promises';
import robotsParser from 'robots-parser';
import { createTransport } from '../collect/engine.mjs';
import { agentToken, userAgent } from '../collect/policy.mjs';
import { hosted, kstNow, read, write } from '../io.mjs';
import { collectYanolja } from './yanolja-feed.mjs';

const origin = 'https://yanoljaresearch.blogspot.com';
const robots = origin + '/robots.txt', feed = origin + '/feeds/posts/default';
const providerId = 'yanolja-blog-atom', file = 'data/syndication.json';
const atomAccept = 'application/atom+xml, application/xml;q=0.9, text/xml;q=0.8';
const pause = code => Object.assign(new Error(code), { publicCode: code, pause: true });
const mime = r => (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();

// One capability per attempt. No registry URL, feed link or redirect Location can extend it.
export function createReaderRequest({ fetcher = fetch, wait = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  let phase = 'robots', delay = 2100;
  const verified = async (url, options) => {
    const r = await fetcher(url, options);
    const abort = async code => { try { await r.body?.cancel(); } finally { throw pause(code); } };
    if (r.redirected || (r.url && r.url !== url) || (r.status >= 300 && r.status < 400)) return abort('redirect');
    if (r.headers.has('www-authenticate') || r.headers.has('proxy-authenticate')) return abort('auth-required');
    if ([401,403,407,410,429,451].includes(r.status)) return abort(`http-${r.status}`);
    if (url === robots && r.status >= 400 && r.status < 500 && r.status !== 408) return abort('robots-unavailable');
    if (r.status === 200 && !(url === robots ? mime(r) === 'text/plain' : ['application/atom+xml','application/xml','text/xml'].includes(mime(r)))) return abort('unexpected-content-type');
    return r;
  };
  const plain = createTransport({ fetcher: verified, wait });
  return async (url, kind) => {
    if (agentToken !== 'SeoulResearchLinks' || !userAgent.startsWith(agentToken + '/')) throw pause('agent-identity');
    if (phase === 'robots' && url === robots && kind === 'robots') {
      phase = 'done';
      const text = await plain(robots, 'robots');
      const rules = robotsParser(robots, text);
      if (!/^\s*user-agent\s*:/im.test(text) || /<\s*[!?a-z]/i.test(text) || rules.isAllowed(feed, agentToken) !== true) throw pause('robots-not-allowed');
      const seconds = rules.getCrawlDelay(agentToken) ?? 0;
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 60) throw pause('crawl-delay-exceeds-budget');
      delay = Math.max(delay, Math.ceil(seconds * 1000));
      phase = 'feed';
      return text;
    }
    if (phase !== 'feed' || url !== feed || kind !== 'xml') throw pause('unreviewed-request');
    phase = 'done';
    await wait(delay);
    const r = await verified(feed, { method: 'GET', redirect: 'manual', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(18000), headers: { 'User-Agent': userAgent, Accept: atomAccept } });
    if (r.status !== 200) { await r.body?.cancel(); throw Object.assign(new Error(), { publicCode: `http-${r.status}` }); }
    if (!r.body) throw new Error();
    const reader = r.body.getReader(), parts = []; let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 2500000) { await reader.cancel(); throw pause('response-too-large'); }
        parts.push(value);
      }
    } finally { reader.releaseLock(); }
    return Buffer.concat(parts).toString('utf8');
  };
}

export function mergeEditions(previous, observations, now) {
  const byUrl = new Map(previous.map(i => [i.url, i]));
  const before = byUrl.size;
  for (const { sourceId, title, url, publishedAt, linkKind, evidenceUrl, workKey } of observations) {
    byUrl.set(url, { sourceId, title, url, publishedAt, linkKind, evidenceUrl, ...(workKey ? { workKey } : {}), fetchedAt: byUrl.get(url)?.fetchedAt ?? now });
  }
  return { items: [...byUrl.values()], newCount: byUrl.size - before };
}

function failure(e) {
  if (/robots/i.test(e?.message || '') && !e?.publicCode) return ['paused', 'robots-not-allowed'];
  if (/Blogger Atom (identity|envelope)/.test(e?.message || '')) return ['paused', 'feed-identity'];
  const code = /^(?:http-\d{3}|agent-identity|auth-required|crawl-delay-exceeds-budget|robots-unavailable|robots-not-allowed|redirect|unreviewed-request|timeout|network-error|response-too-large|unexpected-content-type)$/.test(e?.publicCode) ? e.publicCode : 'network-error';
  return [e?.pause || /^http-(?:3\d\d|401|403|407|410|429|451)$/.test(code) ? 'paused' : 'failed', code];
}

export async function runSyndication(state, { now = kstNow(), collect = collectYanolja, request = createReaderRequest() } = {}) {
  const p = state.providers?.find(x => x.id === providerId);
  if (state.schema !== 'issuer-syndication/1' || !p || !Array.isArray(state.items)) throw Error('Invalid syndication state');
  if (p.status === 'paused') return { state, outcome: 'skip-paused' };
  const time = Date.parse(now);
  if (!Number.isFinite(time) || !now.endsWith('+09:00')) throw Error('Invalid observation timestamp');
  if (p.checkedAt != null && !(time - Date.parse(p.checkedAt) >= 3600000)) return { state, outcome: 'skip-interval' };
  let items = state.items, patch;
  try {
    const batch = await collect({ first: !p.lastSuccessAt, now, request });
    const merged = mergeEditions(items, batch.items, now);
    items = merged.items;
    patch = { status: 'ok', lastSuccessAt: now, error: null, pages: batch.pages, seen: batch.items.length, matched: batch.items.length, unclassified: batch.unclassified, newCount: merged.newCount };
  } catch (e) {
    const [status, error] = failure(e);
    patch = { status, error, lastFailureAt: now, pages: null, seen: null, matched: null, unclassified: null, newCount: null };
  }
  const provider = { ...p, checkedAt: now, ...patch };
  return { state: { ...state, checkedAt: now, providers: state.providers.map(x => x === p ? provider : x), items }, outcome: provider.status };
}

if (import.meta.main) {
  hosted();
  const { state, outcome } = await runSyndication(await read(file));
  if (!outcome.startsWith('skip-')) await write(file, state);
  const p = state.providers.find(x => x.id === providerId);
  const summary = `Yanolja Atom: ${outcome}. Last check: ${p.checkedAt ?? 'none'}; pages ${p.pages ?? 'unknown'}, matched ${p.seen ?? 'unknown'}, classified out ${p.unclassified ?? 'unknown'}, new ${p.newCount ?? 'unknown'}, retained ${state.items.length}.`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
}

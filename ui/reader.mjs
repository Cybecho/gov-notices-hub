import { timestamp } from "./view-model.mjs";

const schema = "seoul-links-reader/2";
const coverageStatus = Symbol("reader coverage status");
const priority = new Map([["hourly", 3], ["reference", 2], ["index", 1]]);
const linkKinds = new Set(["article", "release", "dataset", "anchored-record"]);
const korean = new Intl.Collator("ko", { numeric: true });

const tracker = /^(?:utm_.*|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|_ga|_gl)$/i;
const credential = /^(?:password|passwd|pwd|secret|clientsecret|apikey|servicekey|authkey|authorization|auth|token|(?:access|refresh|id|auth|csrf|security)token|session(?:id)?|jsessionid|phpsessid|signature|sig|x(?:amz|goog)(?:credential|signature|securitytoken))$/i;
const fileExtension = /\.(?:pdf|hwpx?|docx?|xlsx?|xls[bm]|pptx?|od[stp]|csv|zip|7z|rar|gz|exe|msi|apk|jpe?g|png)(?:$|[;/])/i;
const blockedEndpoint = /(?:^|\/)(?:log[-_]?in|sign[-_]?in|oauth2?\/(?:authorize|token)|attachments?|download(?:file)?|(?:[a-z0-9_-]*file|atch|attach)down(?:load)?)(?:$|[./;])/i;
const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
const calendarDate = /^\d{4}-\d{2}-\d{2}$/;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function milliseconds(value, allowDate = false) {
  if (typeof value !== "string") return null;
  if (!instant.test(value) && !(allowDate && calendarDate.test(value))) return null;

  // Date.parse can roll February 30 into March.
  const day = value.slice(0, 10);
  const midnight = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(midnight.getTime()) || midnight.toISOString().slice(0, 10) !== day) {
    return null;
  }

  const ms = timestamp(value, allowDate);
  return Number.isFinite(ms) ? ms : null;
}

function uniqueBy(records, field) {
  const result = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    const id = text(record?.[field]);
    if (id) result.set(id, result.has(id) ? null : record);
  }
  return result;
}

function candidates(sources) {
  const records = Array.isArray(sources) ? sources : sources?.sources;
  return new Map(
    [...uniqueBy(records, "id")].filter(([, source]) => source?.role === "candidate"),
  );
}

function localHost(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[")) {
    const address = host.slice(1, -1);
    const mapped = /^::ffff:([\da-f]+):([\da-f]+)$/.exec(address);
    if (mapped) {
      const high = parseInt(mapped[1], 16);
      const low = parseInt(mapped[2], 16);
      return localHost([high >> 8, high & 255, low >> 8, low & 255].join("."));
    }
    return /^(?:::1?$|f[cd]|fe[89ab])/.test(address);
  }
  if (!host.includes(".") || /(?:^|\.)(?:localhost|local)$/.test(host)) return true;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
  const [a, b] = host.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function unsafeParameters(params) {
  for (const [name, value] of params) {
    const key = name.replace(/[-_]/g, "");
    if (credential.test(key)) return true;
    if (/^(?:action|mode|cmd|method)$/i.test(key) && /^(?:download|login|signin)$/i.test(value)) {
      return true;
    }
    if (/^(?:download|atchfileid)$/i.test(key)) return true;
    if (/(?:file(?:name|path)?|attachment|download)$/i.test(key) && fileExtension.test(value)) {
      return true;
    }
  }
  return false;
}

function publicLink(raw, keepAnchor = false) {
  const value = text(raw);
  if (!/^https?:\/\//i.test(value) || /[\u0000-\u001f\u007f\\]/.test(value)) return null;

  try {
    const url = new URL(value);
    if (url.username || url.password || localHost(url.hostname)) return null;

    const path = decodeURIComponent(url.pathname);
    if (blockedEndpoint.test(path) || fileExtension.test(path) || /;jsessionid=/i.test(path)) {
      return null;
    }
    if (unsafeParameters(url.searchParams)) return null;

    const fragment = url.hash.slice(1);
    if (unsafeParameters(new URLSearchParams(fragment))) return null;
    if (keepAnchor && (!fragment || fragment.startsWith(":~:"))) return null;
    if (!keepAnchor) url.hash = "";

    // Inspect decoded names but copy retained query fields byte-for-byte, in order.
    if (url.search) {
      const fields = url.search.slice(1).split("&");
      const retained = fields.filter((field) => {
        const name = field.split("=", 1)[0];
        return !tracker.test(decodeURIComponent(name.replace(/\+/g, " ")));
      });
      if (retained.length !== fields.length) {
        url.search = retained.length ? `?${retained.join("&")}` : "";
      }
    }
    return url.href;
  } catch {
    return null;
  }
}

function readRow(item, registry) {
  const sourceId = text(item?.sourceId);
  const source = registry.get(sourceId);
  if (!source || !priority.has(item.method) || !linkKinds.has(item.linkKind)) return null;

  const key = text(item.id);
  const title = text(item.title);
  const category = text(source.category) || text(item.category);
  const href = publicLink(item.url, item.linkKind === "anchored-record");
  if (!key || !title || !category || !href) return null;

  return {
    key,
    title,
    href,
    sourceId,
    sourceName: text(source.name) || text(item.sourceName) || sourceId,
    category,
    published: milliseconds(item.publishedAt),
    fetched: milliseconds(item.fetchedAt),
    method: item.method,
    linkKind: item.linkKind,
    ...(/^20\d{2}-(0[1-9]|1[0-2])$/.test(item.periodLabel??'') ? {periodLabel:item.periodLabel} : {}),
    ...(text(item.label) ? {label:text(item.label)} : {}),
    ...(Array.isArray(item.editions) ? {editions:item.editions.map(e=>({href:publicLink(e?.url),published:milliseconds(e?.publishedAt)})).filter(e=>e.href?.startsWith('https://yanoljaresearch.blogspot.com/'))} : {}),
    verifiedAt: milliseconds(item.verifiedAt, true) === null ? null : item.verifiedAt,
    evidenceUrl: publicLink(item.evidenceUrl),
  };
}

function mergePermalink(rows) {
  let primary = rows[0];
  let publication = null;
  let fetched = null;
  let verification = rows[0];
  let verifiedMs = -Infinity;

  for (const row of rows) {
    // Hourly observations take precedence. Equal-priority observations keep input order.
    if (priority.get(row.method) > priority.get(primary.method)) primary = row;
    if (row.published !== null && (!publication || priority.get(row.method) > priority.get(publication.method))) {
      publication = row;
    }
    if (row.fetched !== null && (fetched === null || row.fetched < fetched)) fetched = row.fetched;

    // Keep the evidence with its observation, including when a later check has no evidence URL.
    const checked = milliseconds(row.verifiedAt, true) ?? -Infinity;
    if (checked > verifiedMs || (checked === verifiedMs && row.evidenceUrl && !verification.evidenceUrl)) {
      verification = row;
      verifiedMs = checked;
    }
  }

  return {
    ...primary,
    published: publication?.published ?? null,
    fetched,
    verifiedAt: verification.verifiedAt,
    evidenceUrl: verification.evidenceUrl,
  };
}

function newestFirst(a, b) {
  if (a.published !== b.published) {
    if (a.published === null) return 1;
    if (b.published === null) return -1;
    return b.published - a.published;
  }
  return (b.periodLabel || '').localeCompare(a.periodLabel || '') || korean.compare(a.title, b.title)
    || korean.compare(a.sourceName, b.sourceName)
    || korean.compare(a.key, b.key)
    || (a.key < b.key ? -1 : Number(a.key > b.key));
}

export function toReaderFeed(bundle, sources) {
  if (bundle?.schema !== schema || !Array.isArray(bundle.items)) return [];

  const registry = candidates(sources);
  const hrefById = new Map();
  const groups = new Map();
  for (const item of bundle.items) {
    const row = readRow(item, registry);
    if (!row) continue;

    // An ID cannot transfer observations between different permalinks.
    if (hrefById.has(row.key) && hrefById.get(row.key) !== row.href) continue;
    hrefById.set(row.key, row.href);
    if (!groups.has(row.href)) groups.set(row.href, []);
    groups.get(row.href).push(row);
  }

  const feed = [...groups.values()].map(mergePermalink).sort(newestFirst);
  const statuses = new Map();
  for (const [id, report] of uniqueBy(bundle.coverage, "sourceId")) {
    if (registry.has(id) && text(report?.status)) statuses.set(id, text(report.status));
  }
  Object.defineProperty(feed, coverageStatus, { value: statuses });
  return feed;
}

// Pass the complete feed so zero-row sources retain their reported coverage status.
export function sourceCoverage(feed, sources) {
  const reports = new Map();
  for (const [sourceId, source] of candidates(sources)) {
    reports.set(sourceId, {
      sourceId,
      name: text(source.name) || sourceId,
      count: 0,
      automatic: 0,
      reference: 0,
      index: 0,
      status: feed?.[coverageStatus]?.get(sourceId) ?? "unknown",
    });
  }
  for (const row of Array.isArray(feed) ? feed : []) {
    const report = reports.get(row?.sourceId);
    if (!report || !priority.has(row.method)) continue;
    report.count++;
    report[row.method === "hourly" ? "automatic" : row.method]++;
  }
  return [...reports.values()];
}

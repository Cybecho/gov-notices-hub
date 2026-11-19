import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { sourceCoverage, toReaderFeed } from "./reader.mjs";

const first = "2025-02-01T09:00:00+09:00";
const second = "2025-02-02T09:00:00+09:00";
const third = "2025-02-03T09:00:00+09:00";

function source(id, category = "교육", role = "candidate") {
  return { id, name: `기관 ${id}`, category, role };
}

function item(id, overrides = {}) {
  return {
    id,
    title: `공고 ${id}`,
    url: `https://notices.example.org/board/view.do?seq=${id}`,
    publishedAt: first,
    fetchedAt: second,
    sourceId: "a",
    sourceName: "기관 a",
    category: "교육",
    kind: "notice",
    method: "hourly",
    linkKind: "article",
    verifiedAt: null,
    evidenceUrl: null,
    ...overrides,
  };
}

function bundle(items, coverage = []) {
  return { schema: "seoul-links-reader/2", updatedAt: third, items, coverage };
}

function read(items, sources = [source("a")]) {
  return toReaderFeed(bundle(items), sources);
}

test("candidate catalog IDs work with synthetic permalinks, dates and categories", async () => {
  // Use the public bundle only for identifiers. Publication content can change freely.
  const catalog = JSON.parse(await readFile(new URL("../data/reader.json", import.meta.url), "utf8"));
  const ids = [...new Set(catalog.coverage.map((entry) => entry.sourceId))];
  assert.ok(ids.length >= 2);
  const [a, b] = ids;
  const sources = [source(a, "교육"), source(b, "복지")];
  const feed = read([
    item("one", { sourceId: a, category: "교육" }),
    item("two", { sourceId: b, category: "복지", publishedAt: null }),
  ], sources);

  assert.deepEqual(feed.map((row) => [row.sourceId, row.category, row.published]), [
    [a, "교육", Date.parse(first)],
    [b, "복지", null],
  ]);
  assert.deepEqual(feed.filter((row) => row.category === "복지").map((row) => row.key), ["two"]);
});

test("rejects unknown, noncandidate and ambiguous source IDs before deduplication", () => {
  const sources = [
    source("a"), source("govt", "행정", "government"), source("district", "구정", "district"),
    source("ambiguous"), source("ambiguous", "구정", "district"),
  ];
  const contaminated = ["missing", "govt", "district", "ambiguous"].map((sourceId) =>
    item("same", { sourceId, title: "다른 기관" }),
  );
  const feed = read([...contaminated, item("same", { category: "다른 분야" })], sources);
  assert.deepEqual(feed, [{
    key: "same",
    title: "공고 same",
    href: "https://notices.example.org/board/view.do?seq=same",
    sourceId: "a",
    sourceName: "기관 a",
    category: "교육",
    published: Date.parse(first),
    fetched: Date.parse(second),
    method: "hourly",
    linkKind: "article",
    verifiedAt: null,
    evidenceUrl: null,
  }]);
  assert.deepEqual(sourceCoverage(feed, sources).map((row) => row.sourceId), ["a"]);
});

test("merges observations of one URL and keeps the earliest actual fetch", () => {
  const url = "https://notices.example.org/board/view.do?seq=20";
  const reference = item("ref", {
    url: `${url}&utm_medium=mail#top`, method: "reference", publishedAt: second,
    fetchedAt: first, verifiedAt: "2025-02-02", evidenceUrl: "https://evidence.example.org/check/1",
  });
  const hourly = item("auto", { url, publishedAt: null, fetchedAt: third });
  for (const observations of [[reference, hourly], [hourly, reference]]) {
    const [row, ...rest] = read(observations);
    assert.equal(rest.length, 0);
    assert.equal(row.key, "auto");
    assert.equal(row.method, "hourly");
    assert.equal(row.href, url);
    assert.equal(row.fetched, Date.parse(first));
    assert.equal(row.published, Date.parse(second));
    assert.equal(row.verifiedAt, reference.verifiedAt);
    assert.equal(row.evidenceUrl, reference.evidenceUrl);
  }

  const later = { ...reference, id: "later", verifiedAt: "2025-02-03", evidenceUrl: null };
  const [row] = read([reference, hourly, later]);
  assert.equal(row.verifiedAt, later.verifiedAt);
  assert.equal(row.evidenceUrl, null);
});

test("preserves functional query spelling, repeated key order and stable record anchors", () => {
  const base = "https://records.example.org/open/view.do";
  const query = "key=a%20b&tag=B&flag&tag=A&record=7";
  const original = `${base}?${query}`;
  const reordered = `${base}?key=a%20b&tag=A&flag&tag=B&record=7`;
  const feed = read([
    item("plain", { url: `${original}#section` }),
    item("tracked", { url: `${base}?u%74m_campaign=test&${query}&fbclid=ad` }),
    item("order", { url: reordered }),
    item("anchor1", { url: `${original}#record-7`, linkKind: "anchored-record" }),
    item("anchor2", { url: `${original}#record-8`, linkKind: "anchored-record" }),
    item("anchor1-copy", { url: `${original}&gclid=x#record-7`, linkKind: "anchored-record" }),
    item("no-anchor", { url: base, linkKind: "anchored-record" }),
  ]);
  assert.deepEqual(new Set(feed.map((row) => row.href)), new Set([
    original, reordered, `${original}#record-7`, `${original}#record-8`,
  ]));
  assert.equal(feed.length, 4);
  assert.ok(feed.some((row) => row.key === "plain"));
});

test("keeps first-seen equal-priority metadata and prevents ID conflicts from merging URLs", () => {
  const original = item("first");
  const copy = item("copy", { url: original.url, title: "나중 제목", fetchedAt: first });
  const conflict = item("copy", { url: "https://notices.example.org/other", publishedAt: third });
  const [row, ...rest] = read([original, copy, conflict]);
  assert.equal(rest.length, 0);
  assert.equal(row.key, original.id);
  assert.equal(row.title, original.title);
  assert.equal(row.published, Date.parse(first));
  assert.equal(row.fetched, Date.parse(first));
});

test("orders publication dates newest first, then Korean ties, with unknown dates last", () => {
  const items = [
    item("null", { title: "가", publishedAt: null, fetchedAt: third, verifiedAt: "2025-02-03" }),
    item("na", { title: "나" }),
    item("ga", { title: "가" }),
    item("newest", { publishedAt: second }),
    item("bad", { title: "나", publishedAt: "2025-02-30T09:00:00+09:00", fetchedAt: "bad" }),
  ];
  for (const input of [items, [...items].reverse()]) {
    const feed = read(input);
    assert.deepEqual(feed.map((row) => row.key), ["newest", "ga", "na", "null", "bad"]);
    assert.equal(feed[3].published, null);
    assert.equal(feed[4].published, null);
    assert.equal(feed[4].fetched, null);
  }
});

test("rejects unsafe links and downloads without substituting a source or evidence URL", () => {
  const unsafe = [
    "javascript:alert(1)", "data:text/html,test", "//notices.example.org/record",
    "https://user:secret@notices.example.org/record", "http://localhost/record",
    "http://a.localhost/record", "http://127.1/record", "http://[::1]/record",
    "http://[::ffff:127.0.0.1]/record", "https://notices.example.org/member/login.do",
    "https://notices.example.org/record?access_token=secret",
    "https://notices.example.org/record?serviceKey=secret",
    "https://notices.example.org/record#access_token=secret",
    "https://notices.example.org/report%2EPDF", "https://notices.example.org/book.xlsx",
    "https://notices.example.org/files/fileDown.do?seq=1",
    "https://notices.example.org/view?fileName=notice.hwpx",
  ];
  const fallback = "https://notices.example.org/category";
  const rows = unsafe.map((url, i) => item(String(i), { url, evidenceUrl: fallback }));
  rows.push(item("safe", { evidenceUrl: unsafe[0] }));
  const feed = read(rows, [{ ...source("a"), url: fallback }]);
  assert.deepEqual(feed.map((row) => row.key), ["safe"]);
  assert.equal(feed[0].evidenceUrl, null);
});

test("coverage counts visible methods, retains paused history and includes all 15 candidates", () => {
  const sources = Array.from({ length: 15 }, (_, i) => source(`s${i}`));
  sources.push(source("district", "구정", "district"));
  const feed = toReaderFeed(bundle([
    item("old", { sourceId: "s0", publishedAt: "2019-01-01T09:00:00+09:00" }),
    item("manual", { sourceId: "s0", method: "reference" }),
    item("index", { sourceId: "s0", method: "index", linkKind: "dataset" }),
    item("hidden", { sourceId: "district" }),
  ], [
    { sourceId: "s0", count: 9, automatic: 7, reference: 1, index: 1, status: "paused" },
    { sourceId: "s1", count: 0, automatic: 0, reference: 0, index: 0, status: "unknown" },
  ]), sources);

  assert.ok(feed.some((row) => row.key === "old"));
  const reports = sourceCoverage(feed, sources);
  assert.equal(reports.length, 15);
  assert.deepEqual(reports[0], {
    sourceId: "s0", name: "기관 s0", count: 3, automatic: 1, reference: 1, index: 1, status: "paused",
  });
  for (const report of reports.slice(1)) {
    assert.equal(report.count, 0);
    assert.equal(report.automatic + report.reference + report.index, 0);
    assert.equal(report.status, "unknown");
  }
});

test("handles malformed bundles, registries and records", () => {
  const sources = [source("a")];
  for (const input of [null, {}, { ...bundle([]), schema: "other" }, { ...bundle([]), items: {} }]) {
    assert.deepEqual(toReaderFeed(input, sources), []);
  }
  assert.deepEqual(toReaderFeed(bundle([item("one")]), null), []);
  assert.deepEqual(read([
    null, {}, item(""), item("bad-title", { title: "  " }),
    item("bad-method", { method: "automatic" }), item("bad-kind", { linkKind: "file" }),
  ]), []);
  assert.equal(sourceCoverage(null, sources)[0].status, "unknown");
});

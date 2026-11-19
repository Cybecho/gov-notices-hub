// A bibliography is not a crawl allowlist. Nothing in this module makes a request.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const blogger = 'yanoljaresearch.blogspot.com';
const originHost = 'www.yanolja-research.com';
const hosts = {
  'sto-chart':['www.sto.or.kr'], 'sto-survey':['www.sto.or.kr'],
  cbre:['cbre.com','www.cbre.com','www.cbrekorea.com'],jll:['research.jllapsites.com'],
  cw:['www.newswire.co.kr'],hvs:['hvs.com','www.hvs.com'],phocuswright:['www.phocuswright.com'],skift:['research.skift.com'],
  'consumerinsight-pr':['www.consumerinsight.co.kr'],'opensurvey-blog':['blog.opensurvey.co.kr']
};
const safeTitle=t=> typeof t==='string' && t.trim() && t.length<=440 && !/[\x00-\x1f<>]/u.test(t);
const month=/^20\d{2}-(0[1-9]|1[0-2])$/;
const ymd=/^20\d{2}-(0[1-9]|1[0-2])-([012]\d|3[01])$/;
const mid=d=>{if(d===null)return null;assert.ok(typeof d==='string' && ymd.test(d) && Number.isFinite(Date.parse(d)) && new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d,'invalid publication day');return d+'T00:00:00+09:00';};
const safeUrl=x=>{const u=new URL(x);assert.ok(u.protocol==='https:' && !u.username && !u.password && !u.port && !/[\x00-\x1f\\]/u.test(x),'nonpublic URL');assert.ok(!/\.(?:xlsx?|pdf|docx?|zip|pptx?|csv|hwpx?)$/iu.test(u.pathname) && ![...u.searchParams.keys()].some(k=>/password|token|secret|credential|signature|service.?key|api.?key/i.test(k)),'attachment or credential in link');return u;};
const idFor=(src,url)=>src+'-'+createHash('sha256').update(url).digest('hex').slice(0,22);
function directUrl(s,raw){const u=safeUrl(raw), p=u.pathname, id=s.id;
 if(id.startsWith('yanolja-')){
   const original=u.hostname===originHost && /^\/(?:brief|trend|media|insight)\/view\/\d+$/.test(p);
   const edition=u.hostname===blogger && /^\/20\d{2}\/(?:0[1-9]|1[0-2])\/[a-z0-9][a-z0-9_-]*\.html$/.test(p) && !u.search;
   assert.ok(id!=='yanolja-download' && (original||edition),'unverified Yanolja detail');
 }else{
   assert.ok(hosts[id]?.includes(u.hostname),'unreviewed detail host: '+id);
   if(id.startsWith('sto-'))assert.ok(p.startsWith('/'+id.slice(4)+'/') && /\/\d+\/?$/.test(p));
   if(id==='cw')assert.ok(p==='/newsRead.php' && /^\d+$/.test(u.searchParams.get('no')));
   if(id==='consumerinsight-pr')assert.ok(p==='/boardView' && /^\d+$/.test(u.searchParams.get('no')));
   if(id==='opensurvey-blog')assert.match(p,/^\/trendreport\/[^/]+\/?$/);
   assert.ok(u.href!==(s.listUrl && new URL(s.listUrl).href),'directory not a story');
 }
 return u.href;
}
const keyFor=url=>{const u=new URL(url),m=u.hostname===originHost && /^\/(brief|insight|trend)\/view\/(\d+)$/.exec(u.pathname);return m?'yanolja:'+m[1]+':'+m[2]:null;};
const byDate=(a,b)=>{
 const tick=x=>x.publishedAt?.slice(0,10) || '';
 return tick(b).localeCompare(tick(a))||(b.periodLabel||'').localeCompare(a.periodLabel||'')||a.title.localeCompare(b.title,'ko')||a.id.localeCompare(b.id);
};

export function buildReader({sources,catalog,live,archiveItems=[],syndication,health}){
 assert.equal(catalog.schema,'reader-citations/2');assert.equal(syndication.schema,'issuer-syndication/1');
 const candidates=new Map(sources.filter(s=>s.role==='candidate').map(s=>[s.id,s]));assert.ok(candidates.size);
 const rows=new Map(),works=new Map(),editions=new Map();
 const checkedDay=catalog.reviewedAt.slice(0,10);
 function create(s,r,method,date,fetched=null){assert.ok(s && safeTitle(r.title),'unknown source or invalid title');const url=directUrl(s,r.url);assert.ok(['article','release'].includes(r.linkKind));
   return {id:idFor(s.id,url),sourceId:s.id,sourceName:s.name,category:s.category,kind:s.itemKind,title:r.title.trim(),url,publishedAt:date,fetchedAt:fetched,method,linkKind:r.linkKind,verifiedAt:method==='hourly'?null:checkedDay,evidenceUrl:r.evidenceUrl?safeUrl(r.evidenceUrl).href:null,...(r.periodLabel?{periodLabel:r.periodLabel}:{}),...(r.label?{label:r.label}:{})};}
 for(const r of catalog.items){assert.ok(!r.periodLabel || (month.test(r.periodLabel)&&r.publishedAt===null));assert.ok(['index','reference'].includes(r.method));
   const row=create(candidates.get(r.sourceId),r,r.method,mid(r.publishedAt));assert.ok(!rows.has(row.url),'duplicate bibliography URL');rows.set(row.url,row);
   const wk=keyFor(row.url);if(wk){assert.ok(!works.has(wk),'duplicate work in bibliography');works.set(wk,row);}
   for(const alias of r.verifiedEditions||[]){const a=safeUrl(alias);assert.ok(a.hostname===blogger && !editions.has(a.href));editions.set(a.href,row);}
 }
 // The initial five notices included four supplementary travel-tag links. A matching seed is
 // not itself proof that a list crawler observed that article. Future new list observations are automatic.
 const manuallySeeded=new Set(catalog.initialReferenceUrls||[]);
 for(const n of [...(live.items||[]),...archiveItems]){
   const s=candidates.get(n.sourceId);assert.ok(s && n.sourceId==='opensurvey-blog','no other HTML transport authorized');
   const url=directUrl(s,n.url),existing=rows.get(url),manual=manuallySeeded.has(url);
   const date=n.publishedAt===null?null:mid(n.publishedAt.slice(0,10));assert.ok(!date || date===n.publishedAt,'expected publisher calendar day');
   if(existing && existing.publishedAt && date)assert.equal(existing.publishedAt,date,'publisher date conflict');
   const next=create(s,{...n,linkKind:'article',evidenceUrl:existing?.evidenceUrl || s.listUrl},manual?'reference':'hourly',date??existing?.publishedAt??null,n.fetchedAt);
   if(existing?.fetchedAt && next.fetchedAt && Date.parse(existing.fetchedAt)<Date.parse(next.fetchedAt))next.fetchedAt=existing.fetchedAt;
   rows.set(url,next);
 }
 for(const r of syndication.items){const s=candidates.get(r.sourceId),row=create(s,r,'hourly',mid(r.publishedAt),r.fetchedAt);
   assert.equal(new URL(row.url).hostname,blogger);const byWork=r.workKey&&works.get(r.workKey),byEdition=editions.get(row.url);
   if(byWork && byEdition)assert.equal(byWork.id,byEdition.id,'conflicting edition and original work identifiers');
   const primary=byEdition||byWork;
   if(primary){assert.equal(primary.sourceId,row.sourceId,'edition channel conflicts with original');
     (primary.editions??=[]).push({url:row.url,publishedAt:row.publishedAt,fetchedAt:row.fetchedAt});continue;}
   assert.ok(!rows.has(row.url),'repeated observed edition');row.label='발행처 영문 배포본';rows.set(row.url,row);
 }
 const items=[...rows.values()].sort(byDate);
 const catalogEntries=catalog.catalogEntries.map(e=>{const s=candidates.get(e.sourceId),listUrl=safeUrl(e.listUrl).href;assert.ok(s?.id==='yanolja-download' && listUrl===s.listUrl && safeTitle(e.identifier) && safeTitle(e.title) && e.publishedAt===null);mid(e.modifiedAt);return {sourceId:s.id,identifier:e.identifier,title:e.title,listUrl,publishedAt:null,modifiedAt:e.modifiedAt};});
 assert.equal(new Set(catalogEntries.map(e=>JSON.stringify([e.sourceId,e.identifier]))).size,catalogEntries.length);
 const coverage=[...candidates.values()].map(s=>{const v=items.filter(i=>i.sourceId===s.id),cat=catalogEntries.filter(i=>i.sourceId===s.id).length;
   return {sourceId:s.id,count:v.length+cat,direct:v.length,catalog:cat,automatic:v.filter(r=>r.method==='hourly').length,reference:v.filter(r=>r.method==='reference').length,index:v.filter(r=>r.method==='index').length+cat,status:s.status};});
 const highlights=catalog.highlights.map(x=>{assert.ok(sources.some(s=>s.id===x.sourceId)&&safeTitle(x.title));mid(x.publishedAt);return {sourceId:x.sourceId,title:x.title,url:safeUrl(x.url).href,publishedAt:x.publishedAt,linkKind:x.linkKind};});
 const providers=syndication.providers,checkedAt=syndication.checkedAt;const updatedAt=[catalog.reviewedAt,live.updatedAt,health.checkedAt,checkedAt].filter(x=>x&&Number.isFinite(Date.parse(x))).sort((a,b)=>Date.parse(b)-Date.parse(a))[0];
 return {schema:'seoul-links-reader/2',updatedAt,items,coverage,catalogEntries,highlights,discovery:{checkedAt,channels:[...new Set(providers.flatMap(p=>p.channels))],providers}};
}

/** Low-frequency public transport. No auth, proxy, retries, article bodies, downloads or private endpoints. */
import robotsParser from 'robots-parser';
import {POLICIES, CANDIDATES, agentToken, userAgent, safeListing} from './policy.mjs';
import {parse as consumer} from './adapters/consumer/adapter.mjs';
const adapters={consumer};
const error=(code,pause=false)=>Object.assign(new Error(code),{publicCode:code,pause});
const bounded=async(r,max)=>{const reader=r.body?.getReader();if(!reader)throw error('empty-response');const chunks=[];let bytes=0;try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>max){await reader.cancel();throw error('response-too-large');}chunks.push(Buffer.from(part.value));}}finally{reader.releaseLock();}return Buffer.concat(chunks).toString('utf8');};
export function createTransport({fetcher=fetch,wait=ms=>new Promise(done=>setTimeout(done,ms)),clock=()=>Date.now()}={}){
 let earliest=0;return async(url,kind,delay=2100)=>{await wait(Math.max(0,earliest-clock()));const abort=AbortSignal.timeout(18000);let response;
 try{response=await fetcher(url,{method:'GET',redirect:'manual',credentials:'omit',referrerPolicy:'no-referrer',headers:{'User-Agent':userAgent,'Accept':kind==='robots'?'text/plain':'text/html, application/rss+xml;q=0.9, application/xml;q=0.9'},signal:abort});
 if(response.status!==200){await response.body?.cancel?.();throw error(`http-${response.status}`, [401,403,410,429,451].includes(response.status)||(response.status>=300&&response.status<400));}
 const ct=(response.headers.get('content-type')||'').toLowerCase();if(kind==='robots'?!ct.includes('text/plain'):!/(text\/html|xml|application\/xhtml)/.test(ct)) {await response.body?.cancel?.();throw error('unexpected-content-type',true);}
 return await bounded(response,kind==='robots'?512000:2500000);
 }catch(e){if(e.publicCode)throw e;throw error(abort.aborted?'timeout':'network-error');}finally{earliest=clock()+Math.max(2100,delay);}};
}
export async function collectBoards(sources,{transport=createTransport(),now=new Date().toISOString(),policies=POLICIES,parserMap=adapters}={}){
 const reports=[],batches=[],robotsCache=new Map();
 for(const s of sources){if(s.role!=='candidate'||s.status!=='active')continue;
 const p=policies[s.id];const report={sourceId:s.id,pages:0,items:0,undated:0,mode:s.backfilledAt?'incremental':'backfill',error:null,pause:false};reports.push(report);
 try{
 if(!CANDIDATES.includes(s.id)||!p||s.termsUrl!==p.rights||!s.reviewedAt||Date.parse(now)-Date.parse(s.reviewedAt+'T00:00:00+09:00')>180*86400e3||!s.listUrl||!safeListing(s.listUrl,p))throw error('source-review-required',true);
 const robotsUrl=p.origin+'/robots.txt';if(s.robotsUrl!==robotsUrl)throw error('robots-identity-changed',true);
 if(!robotsCache.has(p.origin)){try{const txt=await transport(robotsUrl,'robots');if(/<!doctype|<html/i.test(txt)||(!/^\s*user-agent\s*:/im.test(txt)&&txt.trim()))throw error('unrecognized-robots',true);robotsCache.set(p.origin,{rules:robotsParser(robotsUrl,txt)});}catch(e){robotsCache.set(p.origin,{failure:e});}}
 const rc=robotsCache.get(p.origin);if(rc.failure)throw rc.failure;
 const rules=rc.rules;const delay=(rules.getCrawlDelay(agentToken)||0)*1000;if(delay>60000)throw error('crawl-delay-exceeds-budget',true);
 const batched=[],seen=new Set();let url=s.listUrl;const max=s.backfilledAt?1:3;
 while(url&&report.pages<max){url=safeListing(url,p);if(!url)throw error('unreviewed-pagination',true);if(seen.has(url))break;seen.add(url);if(rules.isAllowed(url,agentToken)!==true)throw error('robots-disallow',true);
 const html=await transport(url,'list',Math.max(2100,delay));if(!p.recognize(html))throw error('listing-layout-changed',true);
 const parsed=parserMap[p.adapter](s,html,url);if(!parsed||!Array.isArray(parsed.items)||parsed.items.length>300)throw error('invalid-parser-output',true);
 report.pages++;batched.push(...parsed.items);url=parsed.nextUrl||null;
 }
 report.items=batched.length;report.undated=batched.filter(a=>!a.publishedAt).length;batches.push({sourceId:s.id,items:batched});
 }catch(e){report.error=e.publicCode||'parse-failed';report.pause=Boolean(e.pause);}
 }return {reports,batches};
}

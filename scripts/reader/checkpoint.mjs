// Only our own published status is used, never a search proxy or unreviewed issuer route.
// Keep the 1-hour budget across stateless runners without committing empty hourly ticks.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {isDeepStrictEqual} from 'node:util';
import {hosted,read,write} from '../io.mjs';
hosted();const file='data/syndication.json',baseline='.run/syndication-before.json',repo=await read(file),p=repo.providers[0];
if(process.argv[2]==='before'){
 await fs.mkdir('.run',{recursive:true}); await write(baseline,repo);
 const url='https://cybecho.github.io/gov-notices-hub/data/syndication.json?before='+process.env.GITHUB_RUN_ID;
 const r=await fetch(url,{redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(12000)});
 if(r.status===404&&p.status==='pending'&&!repo.checkedAt){console.log('First rollout: no prior public checkpoint.');}
 else {assert.equal(r.status,200,'cannot confirm poll budget; do not contact the publisher');assert.ok(Number(r.headers.get('content-length')||0)<5_000_000);
 const b=await r.text();assert.ok(b.length<5_000_000);const latest=JSON.parse(b),last=latest.providers?.[0];
 assert.ok(latest.schema==='issuer-syndication/1' && last?.id===p.id && ['ok','failed','paused','pending'].includes(last.status) && isDeepStrictEqual(last.channels,p.channels) && latest.providers.length===1 && latest.checkedAt===last.checkedAt);
 // Only copy timestamps/status into identical retained data. A new record or safety pause
 // is committed separately; a rollback or divergent release cannot replace local history.
 if(last.checkedAt && (!p.checkedAt||Date.parse(last.checkedAt)>Date.parse(p.checkedAt))){assert.ok(Number.isFinite(Date.parse(last.checkedAt))&&Date.parse(last.checkedAt)<=Date.now()+120000 && p.status!=='paused' && isDeepStrictEqual(latest.items,repo.items),'unexpected divergent checkpoint');
 for(const k of ['checkedAt','lastFailureAt','lastSuccessAt'])if(last[k]!=null)assert.ok(Number.isFinite(Date.parse(last[k])));
 await write(file,{...repo,checkedAt:latest.checkedAt,providers:[{...p,...Object.fromEntries(['checkedAt','lastFailureAt','lastSuccessAt','newCount','pages','seen','matched','unclassified','status','error'].filter(k=>k in last).map(k=>[k,last[k]]))}]});}
 }
}else if(process.argv[2]==='after'){
 const prev=await read(baseline),before=prev.providers[0];
 if(!isDeepStrictEqual(prev.items,repo.items)||[ 'status','error' ].some(k=>before[k]!==p[k]))await write('.run/persist','yes');
}else throw Error('checkpoint stage required');

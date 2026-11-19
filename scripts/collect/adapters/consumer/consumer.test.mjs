import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from './adapter.mjs';
const origin = 'https://blog.opensurvey.co.kr', list = origin + '/category/trendreport/';
const card = (title,href,date='') => `<a class="post-link" href="${href}"><h4 class="post-item-title">${title}</h4><div class="post-item-excerpt">본문 제외</div><div class="post-item-date">${date}</div></a>`;
test('only report metadata from first-party landing pages; no inferred dates or duplicate cards',()=>{
  const a = card('합성 여행 리포트','/trendreport/fixture-a/','2024-02-29');
  const body = `<link rel="next" href="${list}page/2/">` + a + a + card('합성 숙박 보고서','/trendreport/fixture-b/') + card('합성 IT 리포트','/trendreport/fixture-c/') + card('합성 여행 칼럼','/trendreport/fixture-d/') + card('합성 여행 리포트','https://example.invalid/trendreport/f/') + card('합성 여행 리포트','/wp-content/uploads/f.pdf');
  assert.deepEqual(parse({id:'opensurvey-blog'},body,list),{items:[{title:'합성 여행 리포트',url:origin+'/trendreport/fixture-a/',publishedAt:'2024-02-29'},{title:'합성 숙박 보고서',url:origin+'/trendreport/fixture-b/',publishedAt:null}],nextUrl:list+'page/2/'});
  assert.deepEqual(parse({id:'consumerinsight-pr',status:'static'},body,list),{items:[],nextUrl:null});
});
test('invalid date and offsite pagination not trusted',()=>{
  const r=parse({id:'opensurvey-blog'},card('합성 여행 리포트','/trendreport/fixture-a/','2025-02-30')+'<a class="next page-numbers" href="https://example.invalid/">다음</a>',list);
  assert.equal(r.items[0].publishedAt,null);assert.equal(r.nextUrl,null);
});

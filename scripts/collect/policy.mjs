/** Only a reviewed change to this finite table can start a new source. Registry flags alone never authorize network. */
import {load} from 'cheerio';
export const CANDIDATES=['yanolja-trend','yanolja-insight','yanolja-brief','yanolja-media','yanolja-download','sto-chart','sto-survey','cbre','jll','cw','hvs','phocuswright','skift','consumerinsight-pr','opensurvey-blog'];
export const GU='종로구 중구 용산구 성동구 광진구 동대문구 중랑구 성북구 강북구 도봉구 노원구 은평구 서대문구 마포구 양천구 강서구 구로구 금천구 영등포구 동작구 관악구 서초구 강남구 송파구 강동구'.split(' ');
export const POLICIES={
 'opensurvey-blog':{origin:'https://blog.opensurvey.co.kr',listing:u=>!u.search&&/^\/category\/trendreport\/(?:page\/[1-9]\d*\/)?$/.test(u.pathname),recognize:html=>load(html)('a.post-link .post-item-title').length>0,adapter:'consumer',rights:'https://support.opensurvey.io/ko/articles/8522848-오픈서베이-콘텐츠-인용-및-활용하기'}
};
export const agentToken='SeoulResearchLinks';
export const userAgent='SeoulResearchLinks/1.0 (+https://github.com/Cybecho/gov-notices-hub; title/date/link only)';
export function safeListing(raw,p){try{const u=new URL(raw);return u.protocol==='https:' && u.origin===p.origin && !u.username && !u.password && !u.hash && p.listing(u) ? u.href : null;}catch{return null;}}

# 출처 상태

2026-11-20 KST 기준. [채널별 수록 범위](READER-COVERAGE.md)는 독자가 읽을 수 있는 자료를, 아래 상태는 **원사이트 직접 수집** 여부를 나타냅니다. 15개 채널 중 직접 HTML 수집이 활성인 곳은 오픈서베이 1곳입니다. `paused`는 원사이트 요청 보류, `static`은 직접 수집 없이 참고 링크만 제공한다는 뜻입니다. 야놀자 3개 연구 채널은 원사이트를 요청하지 않고 공식 Blogger 배포 피드를 공유합니다.

[운영 레지스트리](https://cybecho.github.io/gov-notices-hub/data/sources.json) · [실행 기록](https://cybecho.github.io/gov-notices-hub/data/health.json)

| 채널 | 직접 수집 | 목록·참고 | 이용 조건 및 제한 |
|---|---|---|---|
| 야놀자 동향보고서 목록 | `paused` | [열기](https://www.yanolja-research.com/trend/list?lang=kr) | 2023년 1분기~2026년 3분기 숙박업 동향보고서 15호를 확인했습니다. 원사이트 robots 확인 시 403으로 직접 수집 중단. 별도 공식 Blogger Atom에서 배포분만 발견합니다. |
| 야놀자 인사이트 목록 | `paused` | [열기](https://www.yanolja-research.com/insight/list?lang=kr) | Vol.1~48 중 원본 브리프 3건을 제외한 인사이트 45건을 확인했습니다. 원사이트 robots 확인 시 403으로 직접 수집 중단. 별도 공식 Blogger Atom에서 배포분만 발견합니다. |
| 야놀자 브리프 목록 | `paused` | [열기](https://www.yanolja-research.com/brief/list?lang=kr) | 현행 Vol.1~18과 원본 브리프 3건을 수록합니다. 같은 권호라도 원문이 다를 수 있습니다. 원사이트 robots 확인 시 403으로 직접 수집 중단. 별도 공식 Blogger Atom에서 배포분만 발견합니다. |
| 야놀자 보도자료 목록 | `paused` | [열기](https://www.yanolja-research.com/media/list?lang=kr&sub_type=2) | 발행처 자체 보도자료 18건을 선별했습니다. 언론 전재와 Blogger 일반 글은 제외합니다. 직접 수집은 보류합니다. |
| 야놀자 데이터 다운로드 | `paused` | [열기](https://www.yanolja-research.com/datalab/download?lang=kr) | 공동 목록에서 숙박업 실적 지표 9행을 확인했습니다. 개별 상세 페이지가 없어 목록으로만 연결합니다. 최종 수정일은 발행일이 아닙니다. |
| 서울관광재단 자료실 | `paused` | [열기](https://www.sto.or.kr/chart) | 재단 자료실의 개별 게시글 8건을 선별했습니다. 상세에서 확인한 작성일만 사용합니다. 정기 수집 허가·공식 피드 미확인. |
| 서울관광재단 실태조사 | `paused` | [열기](https://www.sto.or.kr/survey) | 조사·통계 게시판 13건을 목록 작성일 기준으로 선별했습니다. 공지 중복은 제외합니다. 정기 수집 허가·공식 피드 미확인. |
| CBRE 서울 호텔 리포트 | `paused` | [열기](https://www.cbre.com.sg/insights/reports/seoul-hotel-investment-same-rooms-new-value) | 서울·한국 및 아시아태평양 호텔 연구 상세 링크 5건을 선별했습니다. 싱가포르 robots.txt 403 및 자동 수집 제한으로 직접 수집 보류. |
| JLL APAC Hotel Market Dynamics | `static` | [열기](https://research.jllapsites.com/sectors/hotels) | APPD 분기별 호텔 인사이트 3건과 서울 분기 자료 1건을 선별했습니다. 자동 질의·체계적 수집 제한으로 정기 요청 없음. [이용 조건](https://research.jllapsites.com/terms-of-use-2) |
| C&W 서울 호스피탤리티 리포트 | `paused` | 원사이트 보고서 링크 미제공 | 뉴스와이어 기업 뉴스룸에서 C&W 코리아가 직접 배포한 기사 2건입니다. 보고서 2종이 아닙니다. 원사이트 약관상 스크래핑·딥링크 제한. 보고서 주소를 추정하지 않으며 뉴스와이어도 정기 요청하지 않습니다. [이용 조건](https://www.cushmanwakefield.com/en/united-states/terms-of-use) |
| HVS Market Snapshot | `static` | [열기](https://hvs.com/publications) | 2022~2026년 아시아태평양 Market Snapshot 5건의 소개 페이지로 연결합니다. 자료 재배포 허가와 구별하며 뉴스 RSS·사이트맵을 정기 조회하지 않습니다. [이용 조건](https://hvs.com/aboutHVS/termsofuse) |
| Phocuswright Research Updates | `paused` | [열기](https://www.phocuswright.com/Travel-Research/Research-Updates) | 숙박·단기임대 연구 상품과 Research Updates 12건을 선별했습니다. 확인된 발행 연월만 표기합니다. 자료 재배포·정기 수집 없음. [이용 조건](https://www.phocuswright.com/About-Us/Privacy-Policy) |
| Skift Research | `static` | [열기](https://research.skift.com/) | 여행·호텔·단기임대 연구 상세 링크 9건을 선별했습니다. 예정표·일반 뉴스는 제외하며 유료 본문을 가져오지 않습니다. [이용 조건](https://skift.com/terms/) |
| 컨슈머인사이트 보도자료 | `static` | [열기](https://www.consumerinsight.co.kr/boardList?cate=trav) | 공식 여행 목록 첫 페이지의 한국어 자료 14건을 선별했습니다. 같은 조사의 영어판은 제외합니다. 비언론사 재사용 제한에 따라 직접 수집 및 뉴스와이어·네이버 정기 요청 없음. [이용 조건](https://www.consumerinsight.co.kr/boardView?id=pr10_list&no=3838&schFlag=0) |
| 오픈서베이 블로그 | `active` | [열기](https://blog.opensurvey.co.kr/category/trendreport/) | 공식 Trend report 목록에서 여행·숙박 관련 제목, 공개 블로그 소개 페이지 주소, 표시된 발행일만 사용한다. 출처는 오픈서베이. 공식 활용 가이드에 따라 PDF 파일·PDF 링크·내용·데이터는 배포하지 않는다. 상세 페이지 및 다운로드 요청 없음. [이용 조건](https://support.opensurvey.io/ko/articles/8522848-오픈서베이-콘텐츠-인용-및-활용하기) |

## 서울 25개구 (시간별 수집 제외)

| 자치구 | 링크 확인 | 종류 | 원문 |
|---|---|---|---|
| 종로구 | 링크 확인됨 | 구청 게시판 | [원문](https://www.jongno.go.kr/portal/bbs/selectBoardList.do?bbsId=BBSMSTR_000000000271&menuId=1756&menuNo=1756) |
| 중구 | 링크 확인됨 | 구청 게시판 | [원문](https://www.junggu.seoul.kr/content.do?cmsid=14232) |
| 용산구 | 링크 확인됨 | 구청 게시판 | [원문](https://www.yongsan.go.kr/portal/bbs/B0000095/list.do?menuNo=200233) |
| 성동구 | 링크 확인됨 | 구청 게시판 | [원문](https://www.sd.go.kr/main/selectBbsNttList.do?bbsNo=184&key=1473&) |
| 광진구 | 링크 확인됨 | 구청 게시판 | [원문](https://www.gwangjin.go.kr/portal/bbs/B0000378/list.do?menuNo=200192) |
| 동대문구 | 링크 확인됨 | 구청 게시판 | [원문](https://www.ddm.go.kr/www/selectEminwonWebList.do?key=3291&searchNotAncmtSeCode=01,02,04,05,06,07) |
| 중랑구 | 링크 확인됨 | 구청 게시판 | [원문](https://www.jungnang.go.kr/portal/bbs/list/B0000117.do?menuNo=200475) |
| 성북구 | 링크 확인됨 | 구청 게시판 | [원문](https://www.sb.go.kr/www/selectEminwonList.do?key=6977) |
| 강북구 | 링크 확인됨 | 구청 게시판 | [원문](https://www.gangbuk.go.kr:18000/portal/bbs/B0000245/list.do?menuNo=200082) |
| 도봉구 | 링크 확인됨 | 구청 게시판 | [원문](https://www.dobong.go.kr/WDB_DEV/gosigong_go/) |
| 노원구 | 링크 확인됨 | 공식 데이터셋 | [원문](https://data.seoul.go.kr/dataList/OA-12727/S/1/datasetView.do) |
| 은평구 | 링크 확인됨 | 구청 게시판 | [원문](https://www.ep.go.kr/www/selectEminwonList.do?key=754&notAncmtSeCode=01) |
| 서대문구 | 링크 확인됨 | 구청 게시판 | [원문](https://www.sdm.go.kr/news/notice/notice.do) |
| 마포구 | 링크 확인됨 | 구청 게시판 | [원문](https://www.mapo.go.kr/site/main/nPortal/list) |
| 양천구 | 링크 확인됨 | 구청 게시판 | [원문](https://www.yangcheon.go.kr/site/yangcheon/ex/seol/seolCollectList.do) |
| 강서구 | 링크 확인됨 | 구청 게시판 | [원문](https://www.gangseo.seoul.kr/gs040301) |
| 구로구 | 링크 확인됨 | 구청 게시판 | [원문](https://www.guro.go.kr/www/selectBbsNttList.do?bbsNo=663&key=1791&) |
| 금천구 | 링크 확인됨 | 구청 게시판 | [원문](https://www.geumcheon.go.kr/portal/tblSeolGosiDetailList.do?key=294&rep=1) |
| 영등포구 | 링크 확인됨 | 구청 게시판 | [원문](https://www.ydp.go.kr/www/selectEminwonList.do?menuFlag=01&key=2851&) |
| 동작구 | 링크 확인됨 | 구청 게시판 | [원문](https://www.dongjak.go.kr/portal/bbs/B0001297/list.do?menuNo=201317) |
| 관악구 | 링크 확인됨 | 공식 데이터셋 | [원문](https://data.seoul.go.kr/dataList/OA-12691/S/1/datasetView.do) |
| 서초구 | 링크 확인됨 | 구청 게시판 | [원문](https://www.seocho.go.kr/site/seocho/05/10506020000002015070811.jsp) |
| 강남구 | 링크 확인됨 | 구청 게시판 | [원문](https://www.gangnam.go.kr/notice/list.do?mid=ID05_040201) |
| 송파구 | 링크 확인됨 | 구청 게시판 | [원문](https://www.songpa.go.kr/www/selectGosiList.do?key=2776&) |
| 강동구 | 링크 확인됨 | 구청 게시판 | [원문](https://www.gangdong.go.kr/web/newportal/notice/01) |

[구별 확인 방법](DISTRICT-REVIEW.md). 개별 게시글/첨부는 수집하지 않습니다.

## 실패 상태 변화 기록

반복되는 동일 오류는 매번 커밋하지 않고 Actions 실행 로그에서 확인합니다. 새 오류나 상태 전환만 누적합니다.

| 한국 시각 | 출처 | 관측 오류 | 조치 |
|---|---|---|---|

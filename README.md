# 서울 숙박 리서치 글 모음

[허브 열기](https://cybecho.github.io/gov-notices-hub/) · [Market Observer 탭](https://cybecho.github.io/airbnb-market-observer/#view=articles) · [수집 상태](docs/SOURCE-STATUS.md).

기본은 발행일 순 타임라인. 외부 자료의 내용을 재게시하지 않고 각 발행처 **원문 링크**로 이동한다. 채널별 분류·검색, 날짜 미확인, 최근 24시간 새 수집, 서울 구청 디렉터리를 제공한다. 정부 및 25구의 루틴 공지는 시간별 피드로 가져오지 않는다.

## 설계와 운영

- 독립 공개 저장소 + 기본 GitHub-hosted Ubuntu + GitHub Pages. 서버, 계정, 유료 API, 사용자 Secret 없음. 사이트는 HTML/ESM/CSS와 상대경로 JSON만 사용한다.
- 검토 대상 15곳 가운데 허용 목록에 있는 소스만 크롤링한다. [매시간 실행](https://github.com/Cybecho/gov-notices-hub/actions/workflows/collect.yml): UTC 매시 정각(한국도 매시 정각), GitHub 사정으로 늦거나 건너뛸 수 있다. 수동 Run workflow도 가능하다. 실제 점검 시간과 게시물 발행일은 별개다.
- 수집 전에 게시판의 robots 경로와 이용 조건을 확인한다. 실행 시 robots를 재확인한다. 하나의 식별 가능한 User-Agent, 2초 이상 간격, 타임아웃·크기 제한·발행처 허용목록을 둔다. 인증·스크래핑 차단은 우회하지 않는다. 규칙이 바뀐 소스는 중지한다.
- 최초: 허용 목록 최대 3쪽과 명시된 같은 출처 여행 태그 보충분을 URL로 합친다. 이후 매시간 첫 목록 1회/출처, robots 파일은 도메인당 1회. 이전 글이 영구히 유지되며 본문·요약·PDF·통계수치를 보관하지 않는다. 날짜가 없으면 null로 유지하고 맨 뒤에 표시한다.
- 최신 2,000건은 data/notices.json, 초과분은 data/archive/YYYY-MM.json 또는 undated.json. 날짜 단위의 제목 식별자와 첫 수집시각은 재실행 후 변하지 않는다.
- 내용·출처 상태가 달라지는 경우에만 커밋한다. 소식이 없더라도 검산된 Pages 산출물에는 최근 확인시각을 제공한다. 내용이나 수집 출처 문제가 생기면 지난 정상 자료를 유지한다. 개별 출처 실패와 전체 스키마/브라우저 검사 실패를 구분한다. 배포 전 npm run typecheck, npm test, npm run validate, npm run build, npm run test:browser 통과가 필수다.
- 배포 직후 공개 provenance, 원장 합계, 25개구를 다시 확인한다. 최초 24시간에는 예약 실행의 event=schedule과 성공/실패, 과거 자료 유지 여부를 함께 점검한다. 공개 저장소가 60일 동안 활동이 없으면 예약이 중지될 수 있다. 월 1회 Actions 탭의 활성 상태를 확인하고 필요하면 Enable workflow 후 Run workflow로 검산한다. 수동 클릭 한 번이 60일 정책의 무조건적인 연장을 보장하지 않는다.

## 범위와 결정

저장소 이름은 요청대로 gov-notices-hub. 미확인 URL은 추측하지 않고, 403·금지·권리 미확인 출처는 정적 링크/보류로 유지한다. 허용 근거가 바뀌었을 때만 코드의 정책표·파서·테스트와 레지스트리를 함께 검토한다. 서울시보·구청에서 중요한 고시만 자동 선별하는 별도 기능은 소유자가 범위를 넓히기로 결정하기 전에는 켜지 않는다.

[조사 방법과 권리](docs/RESEARCH-NOTES.md) · [검토 원천/정적 링크 전체](data/sources.json).

브라우저 QA는 `ubuntu-24.04` 기본 이미지의 Google Chrome 버전을 로그에 남기고 Playwright로 동일한 전체 시나리오를 실행한다. 매시간 Chromium과 데스크톱 시스템 패키지를 중복 다운로드하지 않으며, 실행 파일이 없거나 테스트가 실패하면 게시하지 않는다.

열어둔 브라우저도 화면이 보이면 1시간 경과 후 Pages의 공개 JSON을 다시 읽는다. **새로 확인**은 같은 공개 파일만 읽으며 발행처 요청이나 Actions 수집을 실행하지 않는다. 수집·발행일·배포 시각을 혼동하지 않도록 화면에는 검산된 마지막 수집 점검 시각을 표시한다.

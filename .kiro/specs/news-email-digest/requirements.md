# 요구사항 문서

## 소개

뉴스 요약 이메일 다이제스트 서비스는 RSS 피드에서 뉴스를 자동 수집하고, 무료 AI 도구로 요약 및 번역한 뒤, 사용자의 이메일로 발송하는 경량 개인용 서비스이다. 백엔드 서버 없이 스크립트 또는 서버리스 기반으로 동작하며, 최소한의 인프라로 운영할 수 있다.

## 용어 사전

- **Digest_Service**: 뉴스 수집, 요약, 이메일 발송을 수행하는 전체 시스템
- **RSS_Collector**: RSS 피드에서 뉴스 기사를 파싱하고 수집하는 모듈
- **AI_Summarizer**: 수집된 뉴스 기사를 요약하고 번역하는 AI 처리 모듈
- **Email_Sender**: 요약된 뉴스를 이메일로 발송하는 모듈
- **Feed_Source**: RSS 피드 URL과 카테고리 정보를 포함하는 뉴스 소스 설정
- **Digest**: 하나의 발송 단위로 묶인 요약 뉴스 모음
- **Scheduler**: 정해진 주기에 따라 Digest_Service를 실행하는 스케줄러

## 요구사항

### 요구사항 1: RSS 뉴스 수집

**사용자 스토리:** 개인 사용자로서, 다양한 뉴스 소스에서 최신 기사를 자동으로 수집하고 싶다. 이를 통해 여러 사이트를 직접 방문하지 않아도 된다.

#### 수용 기준

1. WHEN Digest_Service가 실행되면, THE RSS_Collector SHALL 설정 파일에 정의된 모든 Feed_Source의 RSS 피드를 파싱하여 기사 목록을 반환한다
2. WHEN RSS 피드를 파싱할 때, THE RSS_Collector SHALL 각 기사의 제목, URL, 발행일, 소스명을 추출한다
3. WHEN 이전 실행에서 이미 수집된 기사 URL이 발견되면, THE RSS_Collector SHALL 해당 기사를 건너뛰고 새로운 기사만 수집한다
4. IF RSS 피드 파싱에 실패하면, THEN THE RSS_Collector SHALL 해당 소스를 건너뛰고 에러를 로그에 기록하며 나머지 소스의 수집을 계속한다
5. WHEN 기사 본문이 필요한 경우, THE RSS_Collector SHALL 기사 URL에서 HTML을 가져와 본문 텍스트를 추출한다

### 요구사항 2: AI 뉴스 요약 및 번역

**사용자 스토리:** 개인 사용자로서, 수집된 뉴스 기사를 짧고 읽기 쉬운 한국어 요약으로 받고 싶다. 이를 통해 핵심 내용을 빠르게 파악할 수 있다.

#### 수용 기준

1. WHEN 새로운 기사가 수집되면, THE AI_Summarizer SHALL 각 기사를 3~5문장으로 요약한다
2. WHEN 영문 기사가 수집되면, THE AI_Summarizer SHALL 요약과 동시에 한국어로 번역하여 제공한다. 제목도 한국어로 번역한다
3. THE AI_Summarizer SHALL Google Gemini API 무료 티어를 사용하여 요약 및 번역을 단일 프롬프트로 수행한다
4. IF AI API 호출에 실패하면, THEN THE AI_Summarizer SHALL 기사의 첫 2~3문장을 발췌하여 대체 요약으로 사용한다
5. WHEN 요약을 수행할 때, THE AI_Summarizer SHALL 원문의 핵심 사실, 인물, 수치를 보존한다

### 요구사항 3: 이메일 발송

**사용자 스토리:** 개인 사용자로서, 요약된 뉴스를 매일 이메일로 받고 싶다. 이를 통해 별도의 앱이나 웹사이트 없이 뉴스를 확인할 수 있다.

#### 수용 기준

1. WHEN 모든 기사의 요약이 완료되면, THE Email_Sender SHALL 요약 결과를 하나의 Digest로 묶어 설정된 이메일 주소로 발송한다
2. WHEN Digest를 구성할 때, THE Email_Sender SHALL 기사 제목, 요약 내용, 원문 링크, 소스명, 발행일을 포함한다
3. WHEN Digest 이메일을 생성할 때, THE Email_Sender SHALL 읽기 쉬운 HTML 형식으로 포맷팅한다
4. THE Email_Sender SHALL 무료 이메일 발송 서비스(예: Nodemailer + Gmail SMTP, Resend 무료 티어)를 사용한다
5. IF 이메일 발송에 실패하면, THEN THE Email_Sender SHALL 최대 3회까지 재시도하고, 모든 재시도 실패 시 에러를 로그에 기록한다

### 요구사항 4: 설정 관리

**사용자 스토리:** 개인 사용자로서, RSS 소스, 발송 시간, 수신 이메일 등을 쉽게 설정하고 싶다. 이를 통해 원하는 뉴스만 원하는 시간에 받을 수 있다.

#### 수용 기준

1. THE Digest_Service SHALL JSON 또는 YAML 설정 파일에서 Feed_Source 목록, 수신 이메일 주소, 발송 주기를 읽어온다
2. WHEN 설정 파일을 로드할 때, THE Digest_Service SHALL 필수 필드(Feed_Source 최소 1개, 수신 이메일 주소)의 존재를 검증한다
3. IF 설정 파일이 유효하지 않으면, THEN THE Digest_Service SHALL 구체적인 검증 오류 메시지를 출력하고 실행을 중단한다
4. THE Digest_Service SHALL 환경변수를 통해 API 키, 이메일 인증 정보 등 민감한 설정을 관리한다

### 요구사항 5: 스케줄링 및 실행

**사용자 스토리:** 개인 사용자로서, 서비스가 자동으로 정해진 시간에 실행되길 원한다. 이를 통해 수동 개입 없이 매일 뉴스를 받을 수 있다.

#### 수용 기준

1. THE Digest_Service SHALL 단일 스크립트 실행 명령으로 전체 파이프라인(수집 → 요약 → 발송)을 수행한다
2. THE Scheduler SHALL GitHub Actions 스케줄 워크플로우, Vercel Cron, 또는 로컬 cron 등 서버리스 호환 무료 스케줄링 도구를 사용하여 Digest_Service를 주기적으로 실행한다
3. WHEN Digest_Service가 실행되면, THE Digest_Service SHALL 실행 시작 시간, 수집된 기사 수, 요약 성공/실패 수, 발송 결과를 로그로 출력한다
4. IF 전체 파이프라인 실행 중 치명적 오류가 발생하면, THEN THE Digest_Service SHALL 에러 내용을 로그에 기록하고 비정상 종료 코드를 반환한다

### 요구사항 6: 중복 방지 및 상태 관리

**사용자 스토리:** 개인 사용자로서, 이미 받은 뉴스가 다시 발송되지 않길 원한다. 이를 통해 중복 없는 깔끔한 다이제스트를 받을 수 있다.

#### 수용 기준

1. THE Digest_Service SHALL 이전에 발송된 기사의 URL을 경량 저장소(로컬 JSON 파일, GitHub Actions 캐시, 또는 KV 스토어)에 기록하여 상태를 유지한다
2. WHEN 새로운 기사를 수집할 때, THE RSS_Collector SHALL 상태 저장소의 기록과 대조하여 이미 발송된 기사를 제외한다
3. WHEN Digest 발송이 성공하면, THE Digest_Service SHALL 발송된 기사의 URL을 상태 저장소에 추가한다
4. THE Digest_Service SHALL 상태 저장소의 크기를 관리하기 위해 30일 이상 된 기록을 자동으로 정리한다

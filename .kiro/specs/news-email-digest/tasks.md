# 구현 계획: 뉴스 요약 이메일 다이제스트

## 개요

TypeScript 기반 경량 뉴스 이메일 다이제스트 서비스를 구현한다. 각 모듈을 순차적으로 구현하고, 파이프라인으로 연결한 뒤, GitHub Actions로 자동화한다.

## 작업 목록

- [x] 1. 프로젝트 초기 설정 및 타입 정의
  - [x] 1.1 프로젝트 초기화 및 의존성 설치
    - `package.json` 생성, TypeScript, tsx, rss-parser, cheerio, nodemailer, fast-check, vitest 설치
    - `tsconfig.json` strict 모드 설정
    - 디렉토리 구조 생성 (`src/collector/`, `src/summarizer/`, `src/email/`, `src/state/`, `src/config/`, `src/types/`)
    - _Requirements: 5.1_
  - [x] 1.2 공유 타입 정의 (`src/types/index.ts`)
    - DigestConfig, FeedSource, EmailConfig, AIConfig, CollectedArticle, SummarizedArticle, Digest, DigestStats, StateData, ProcessedEntry, SendResult 인터페이스 정의
    - _Requirements: 1.2, 3.2, 4.1, 6.1_

- [x] 2. 설정 로더 구현
  - [x] 2.1 설정 파일 로더 및 검증기 구현 (`src/config/config-loader.ts`)
    - JSON 파일에서 DigestConfig 로드
    - 필수 필드 검증 (sources 최소 1개, email.to 존재)
    - 검증 실패 시 구체적 에러 메시지와 함께 에러 throw
    - 환경변수에서 민감 정보 로드 (AI API 키, SMTP 인증)
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [ ]* 2.2 설정 로더 속성 테스트
    - **Property 1: 설정 파싱 round-trip**
    - **Property 2: 설정 검증 — 유효/무효 분류**
    - **Validates: Requirements 4.1, 4.2, 4.3**

- [x] 3. 상태 저장소 구현
  - [x] 3.1 상태 저장소 구현 (`src/state/state-store.ts`)
    - JSON 파일 기반 load/save
    - isProcessed(url) — URL이 이미 처리되었는지 확인
    - addProcessed(urls) — 처리된 URL 추가
    - cleanup(maxAgeDays) — 오래된 항목 정리
    - 상태 파일 없을 때 빈 상태로 초기화
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [ ]* 3.2 상태 저장소 속성 테스트
    - **Property 8: 상태 저장소 round-trip**
    - **Property 9: 상태 저장소 insert/contains**
    - **Property 10: 상태 정리 — 날짜 기반 필터링**
    - **Validates: Requirements 6.1, 6.3, 6.4**

- [x] 4. 체크포인트 — 기반 모듈 검증
  - 모든 테스트가 통과하는지 확인한다. 문제가 있으면 사용자에게 질문한다.

- [x] 5. RSS 수집기 구현
  - [x] 5.1 RSS 수집기 구현 (`src/collector/rss-collector.ts`)
    - rss-parser로 피드 파싱, 기사 목록 반환
    - collectAll — 모든 소스 순회, 실패한 소스 건너뛰기
    - collectFeed — 단일 소스 수집
    - extractContent — cheerio로 HTML에서 본문 텍스트 추출
    - 중복 필터링 (StateStore.isProcessed 활용)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - [ ]* 5.2 RSS 수집기 속성 테스트
    - **Property 3: RSS 수집 결과 필수 필드 존재**
    - **Property 4: HTML 본문 추출 시 태그 제거**
    - **Property 5: 중복 필터링 — 처리된 URL 제외**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.5, 6.2**
  - [ ]* 5.3 RSS 수집기 단위 테스트
    - 피드 파싱 실패 시 나머지 소스 계속 수집 테스트
    - _Requirements: 1.4_

- [x] 6. AI 요약기 구현
  - [x] 6.1 AI 요약기 구현 (`src/summarizer/ai-summarizer.ts`)
    - Google Gemini API 연동 (요약 + 한국어 번역을 단일 프롬프트로 처리)
    - summarize — 단일 기사 요약 및 제목/본문 한국어 번역
    - summarizeBatch — 배치 요약 (Rate Limit 고려하여 순차 처리, 요청 간 4초 간격)
    - 폴백 로직 — API 실패 시 첫 2~3문장 발췌 (번역 없이 원문)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [ ]* 6.2 AI 요약기 속성 테스트
    - **Property 6: AI 폴백 요약이 원문 앞부분과 일치**
    - **Validates: Requirements 2.4**

- [x] 7. 이메일 발송기 구현
  - [x] 7.1 이메일 HTML 템플릿 및 빌더 구현 (`src/email/email-sender.ts`, `src/email/templates/digest.html`)
    - buildHtml — SummarizedArticle 목록을 HTML Digest로 변환
    - 각 기사의 제목, 요약, 원문 링크, 소스명, 발행일 포함
    - 카테고리별 그룹핑
    - _Requirements: 3.2, 3.3_
  - [x] 7.2 이메일 발송 로직 구현
    - Nodemailer + Gmail SMTP 연동
    - send — Digest 발송, 최대 3회 재시도 (exponential backoff)
    - _Requirements: 3.1, 3.4, 3.5_
  - [ ]* 7.3 이메일 발송기 속성 테스트
    - **Property 7: Digest HTML에 모든 기사의 필수 정보 포함**
    - **Validates: Requirements 3.2**
  - [ ]* 7.4 이메일 발송기 단위 테스트
    - 3회 재시도 로직 테스트
    - _Requirements: 3.5_

- [x] 8. 체크포인트 — 개별 모듈 검증
  - 모든 테스트가 통과하는지 확인한다. 문제가 있으면 사용자에게 질문한다.

- [x] 9. 파이프라인 오케스트레이터 구현
  - [x] 9.1 메인 파이프라인 구현 (`src/main.ts`)
    - 설정 로드 → 상태 로드 → RSS 수집 → 중복 필터링 → AI 요약 → 이메일 발송 → 상태 업데이트 → 로그 출력
    - DigestStats 집계 및 로그 출력
    - 치명적 오류 시 비정상 종료 코드 반환
    - 새 기사가 없으면 이메일 발송 건너뛰기
    - _Requirements: 5.1, 5.3, 5.4_
  - [ ]* 9.2 파이프라인 단위 테스트
    - 실행 로그 출력 검증
    - 치명적 오류 시 종료 코드 검증
    - _Requirements: 5.3, 5.4_

- [x] 10. GitHub Actions 워크플로우 설정
  - [x] 10.1 GitHub Actions 스케줄 워크플로우 작성 (`.github/workflows/digest.yml`)
    - cron 스케줄 설정 (매일 아침)
    - 환경변수 시크릿 설정
    - state.json 캐시 설정 (actions/cache)
    - npm install → tsx src/main.ts 실행
    - _Requirements: 5.2, 6.1_

- [x] 11. 설정 파일 및 문서
  - [x] 11.1 기본 설정 파일 작성 (`config.example.json`)
    - 예시 RSS 소스, 이메일 설정, AI 설정 포함
    - _Requirements: 4.1_
  - [x] 11.2 `.env.example` 작성
    - 필요한 환경변수 목록과 설명
    - _Requirements: 4.4_

- [x] 12. 최종 체크포인트 — 전체 통합 검증
  - 모든 테스트가 통과하는지 확인한다. 문제가 있으면 사용자에게 질문한다.

## 참고

- `*` 표시된 작업은 선택 사항이며, 핵심 기능 우선 구현 시 건너뛸 수 있다
- 각 작업은 이전 작업의 결과를 기반으로 한다
- 속성 테스트는 fast-check로 최소 100회 반복 실행한다
- 단위 테스트는 특정 예시와 엣지 케이스를 검증한다

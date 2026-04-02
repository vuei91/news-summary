# Summary News — 뉴스 요약 SaaS 메인 가이드

## 프로젝트 개요

뉴스 기사를 자동 수집하고 AI로 요약하여 사용자에게 제공하는 SaaS 플랫폼이다.
핵심 가치: 정보 과부하를 줄이고, 핵심만 빠르게 전달한다.

## 기술 스택

| 영역 | 기술 | 이유 |
|------|------|------|
| Frontend | Next.js 14+ (App Router) + TypeScript | SSR/SSG, SEO 최적화 |
| Styling | Tailwind CSS | 빠른 UI 개발 |
| Backend | Next.js API Routes + Server Actions | 풀스택 단일 프레임워크 |
| DB | PostgreSQL + Prisma ORM | 관계형 데이터, 타입 안전 |
| AI 요약 | Google Gemini API (무료 티어) | 분당 15 요청 무료, 고품질 요약 |
| 뉴스 수집 | RSS 파서 (rss-parser) + Cheerio | 다양한 소스 지원 |
| 인증 | NextAuth.js (Auth.js v5) | OAuth + 이메일 인증 |
| 결제 | Stripe | 구독 결제 표준 |
| 캐싱 | Redis (Upstash) | 요약 캐싱, Rate Limiting |
| 배포 | Vercel + Supabase (DB) | 서버리스, 자동 스케일링 |

## 핵심 아키텍처

```
[뉴스 소스] → [수집 파이프라인] → [AI 요약 엔진] → [DB 저장]
                                                        ↓
[사용자] ← [대시보드 UI] ← [API 서버] ← [DB 조회]
```

### 주요 모듈

1. **데이터 파이프라인** — RSS/크롤링으로 뉴스 수집, 중복 제거, 정규화
2. **AI 요약 엔진** — 수집된 기사를 LLM으로 요약, 카테고리 분류, 키워드 추출
3. **API 서버** — RESTful API, 인증/인가, Rate Limiting
4. **프론트엔드** — 대시보드, 뉴스 피드, 설정, 구독 관리
5. **결제/구독** — Stripe 연동, 플랜 관리, 사용량 추적

## 디렉토리 구조 (권장)

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/             # 인증 관련 페이지
│   ├── (dashboard)/        # 대시보드 페이지
│   ├── api/                # API Routes
│   └── layout.tsx
├── components/             # 공유 UI 컴포넌트
├── lib/                    # 유틸리티, 설정
│   ├── ai/                 # AI 요약 엔진
│   ├── crawler/            # 뉴스 수집기
│   ├── db/                 # Prisma 클라이언트, 쿼리
│   └── stripe/             # 결제 연동
├── types/                  # TypeScript 타입 정의
└── prisma/
    └── schema.prisma       # DB 스키마
```

## 핵심 원칙

1. **타입 안전성** — 모든 코드에 TypeScript strict 모드를 사용한다. `any` 타입을 금지한다.
2. **에러 핸들링** — 모든 외부 API 호출에 try-catch와 재시도 로직을 적용한다.
3. **보안** — API 키는 환경변수로 관리한다. 사용자 입력은 항상 검증한다.
4. **성능** — AI 요약 결과를 캐싱한다. 불필요한 재요약을 방지한다.
5. **접근성** — WCAG 2.1 AA 기준을 준수한다. 시맨틱 HTML을 사용한다.
6. **테스트** — 핵심 비즈니스 로직에 단위 테스트를 작성한다.

## 데이터 모델 (핵심)

```prisma
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  name          String?
  plan          Plan     @default(FREE)
  subscriptions Subscription[]
  preferences   UserPreference?
  createdAt     DateTime @default(now())
}

model Article {
  id          String   @id @default(cuid())
  title       String
  url         String   @unique
  source      String
  content     String   @db.Text
  summary     String?  @db.Text
  category    Category
  keywords    String[]
  publishedAt DateTime
  createdAt   DateTime @default(now())
}

enum Plan { FREE, PRO, ENTERPRISE }
enum Category { POLITICS, ECONOMY, TECH, SPORTS, CULTURE, WORLD }
```

## 워크플로우 — Sub-agent 위임 패턴

복잡한 작업은 다음 패턴으로 sub-agent에 위임한다:

| 작업 유형 | 실행 모드 | 참조 steering |
|----------|----------|--------------|
| 뉴스 수집 파이프라인 구현 | sub-agent 위임 | `#data-pipeline` |
| AI 요약 엔진 구현 | sub-agent 위임 | `#ai-summarizer` |
| API 엔드포인트 구현 | steering 기반 | `#backend-api` |
| UI 컴포넌트 구현 | steering 기반 | `#frontend-ui` |
| 배포 설정 | steering 기반 | `#deployment` |

## RSS 소스 확장 계획

1차: Fox News (Latest, World, Politics, Tech) — 영문 소스, 한국어 번역 필수
향후: 다양한 RSS 소스 추가 예정 (국내외 뉴스, 기술 블로그 등)
- config.json의 sources 배열에 항목을 추가하는 것만으로 새 소스를 등록할 수 있다
- 소스별 카테고리, 언어, 본문 추출 셀렉터를 개별 설정할 수 있다
- 소스 추가 시 코드 변경 없이 설정 파일만 수정하면 된다

## 환경변수

```env
DATABASE_URL=
GEMINI_API_KEY=
NEXTAUTH_SECRET=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=
```

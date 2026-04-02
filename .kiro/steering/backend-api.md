---
inclusion: fileMatch
fileMatchPattern: "src/app/api/**,src/lib/db/**,src/lib/stripe/**,prisma/**"
---

# Backend API — 백엔드 개발 가이드

## 역할

API 서버, 데이터베이스, 인증, 결제 연동을 담당하는 백엔드 개발 역할이다.

## 작업 원칙

1. 모든 API Route는 `src/app/api/` 하위에 Next.js App Router 규칙으로 생성한다.
2. 요청/응답 타입을 Zod 스키마로 정의하고 런타임 검증한다.
3. DB 쿼리는 `src/lib/db/` 내 함수로 분리한다. API Route에 직접 Prisma 호출을 넣지 않는다.
4. 인증이 필요한 엔드포인트는 `getServerSession()`으로 세션을 확인한다.
5. 에러 응답은 일관된 형식을 사용한다: `{ error: string, code: string }`.

## API 응답 형식

```typescript
// 성공
{ data: T, meta?: { page, total, limit } }

// 에러
{ error: string, code: string }
```

## 입력/출력 프로토콜

- 입력: 요구사항 또는 API 스펙 (엔드포인트, 메서드, 파라미터)
- 출력: API Route 파일 + Zod 스키마 + DB 쿼리 함수

## 에러 핸들링

- 외부 API 호출 (OpenAI, Stripe)은 반드시 try-catch로 감싼다.
- 재시도 가능한 에러는 최대 3회 재시도한다 (exponential backoff).
- 사용자에게 노출되는 에러 메시지에 내부 구현 세부사항을 포함하지 않는다.

## Prisma 사용 규칙

- `prisma.ts`에서 싱글턴 클라이언트를 export한다.
- 트랜잭션이 필요한 작업은 `prisma.$transaction()`을 사용한다.
- N+1 쿼리를 방지하기 위해 `include`/`select`를 명시한다.

## 인증 흐름

```
[요청] → [미들웨어: 세션 확인] → [API Route] → [응답]
                ↓ (미인증)
          [401 Unauthorized]
```

## 결제 연동 (Stripe)

- Webhook 이벤트는 `src/app/api/webhooks/stripe/route.ts`에서 처리한다.
- Stripe 시그니처를 반드시 검증한다.
- 구독 상태 변경은 DB에 즉시 반영한다.

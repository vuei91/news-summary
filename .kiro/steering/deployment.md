---
inclusion: manual
---

# Deployment — 배포 가이드

## 역할

프로젝트의 빌드, 배포, 인프라 설정을 담당하는 배포 역할이다.

## 배포 아키텍처

```
[GitHub] → [Vercel (자동 배포)] → [Production]
                ↓
         [Supabase (PostgreSQL)]
         [Upstash (Redis)]
         [Stripe (결제)]
         [OpenAI (AI)]
```

## 작업 원칙

1. main 브랜치 push 시 Vercel이 자동 배포한다.
2. PR마다 Preview 배포를 생성한다.
3. 환경변수는 Vercel Dashboard에서 관리한다. `.env` 파일을 커밋하지 않는다.
4. DB 마이그레이션은 배포 전에 수동으로 실행한다.

## 환경 구분

| 환경 | 용도 | DB |
|------|------|-----|
| development | 로컬 개발 | 로컬 PostgreSQL 또는 Supabase dev |
| preview | PR 리뷰 | Supabase staging |
| production | 실서비스 | Supabase production |

## Vercel 설정

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/collect",
      "schedule": "*/30 * * * *"
    }
  ]
}
```

## DB 마이그레이션

```bash
# 개발 환경
npx prisma migrate dev

# 프로덕션 배포 전
npx prisma migrate deploy
```

## 모니터링

- Vercel Analytics로 성능 모니터링
- Sentry로 에러 추적 (선택)
- Upstash Console로 Redis 사용량 확인

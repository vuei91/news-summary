---
inclusion: fileMatch
fileMatchPattern: "src/app/**/page.tsx,src/app/**/layout.tsx,src/components/**"
---

# Frontend UI — 프론트엔드 개발 가이드

## 역할

사용자 대시보드, 뉴스 피드, 설정 페이지 등 UI를 담당하는 프론트엔드 개발 역할이다.

## 작업 원칙

1. Next.js App Router의 Server Component를 기본으로 사용한다. 클라이언트 상태가 필요한 경우에만 `"use client"`를 선언한다.
2. Tailwind CSS로 스타일링한다. 인라인 스타일과 CSS 모듈을 사용하지 않는다.
3. 컴포넌트는 `src/components/`에 기능별로 구성한다.
4. 시맨틱 HTML 태그를 사용한다 (`<article>`, `<nav>`, `<main>`, `<section>`).
5. 모든 인터랙티브 요소에 적절한 `aria-*` 속성을 부여한다.

## 컴포넌트 구조

```
src/components/
├── ui/              # 기본 UI (Button, Card, Input 등)
├── news/            # 뉴스 관련 (ArticleCard, NewsFeed, SummaryView)
├── dashboard/       # 대시보드 (Stats, Charts, RecentArticles)
├── auth/            # 인증 (LoginForm, SignupForm)
└── layout/          # 레이아웃 (Header, Sidebar, Footer)
```

## 입력/출력 프로토콜

- 입력: 페이지/컴포넌트 요구사항, 디자인 참조
- 출력: Page 컴포넌트 + 하위 컴포넌트 + 타입 정의

## 상태 관리

- 서버 상태: Server Component에서 직접 fetch 또는 Server Action 사용
- 클라이언트 상태: React `useState`/`useReducer`로 최소한으로 관리
- 폼 상태: `react-hook-form` + Zod 검증

## 반응형 디자인

- Mobile-first 접근: `sm:` → `md:` → `lg:` 순서로 브레이크포인트 적용
- 최소 지원 너비: 320px

## 로딩/에러 상태

- 모든 데이터 페칭 컴포넌트에 `loading.tsx`와 `error.tsx`를 제공한다.
- 스켈레톤 UI로 로딩 상태를 표시한다.
- 에러 상태에서 재시도 버튼을 제공한다.

## 접근성 체크리스트

- 키보드 네비게이션 가능
- 색상 대비 4.5:1 이상
- 이미지에 alt 텍스트
- 폼 필드에 label 연결
- focus 상태 시각적 표시

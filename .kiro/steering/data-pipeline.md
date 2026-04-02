---
inclusion: fileMatch
fileMatchPattern: "src/lib/crawler/**"
---

# Data Pipeline — 뉴스 수집 파이프라인 가이드

## 역할

RSS 피드와 웹 크롤링으로 뉴스를 수집하고, 중복을 제거하며, 정규화하여 DB에 저장하는 데이터 파이프라인 역할이다.

## 작업 원칙

1. 수집 소스는 설정 파일(`src/lib/crawler/sources.ts`)로 관리한다. 하드코딩하지 않는다.
2. 중복 판별은 URL 기준으로 한다. DB에 이미 존재하는 URL은 스킵한다.
3. HTML 콘텐츠에서 본문만 추출한다. 광고, 네비게이션, 푸터를 제거한다.
4. 수집 주기는 Cron Job으로 설정한다 (기본: 30분 간격).
5. 소스별 Rate Limiting을 준수한다. robots.txt를 확인한다.

## 수집 파이프라인

```
[RSS 피드 목록] → [피드 파싱 (rss-parser)]
     → [URL 중복 체크 (DB 조회)]
     → [본문 크롤링 (Cheerio)]
     → [콘텐츠 정규화 (HTML → 텍스트)]
     → [DB 저장 (Article 모델)]
     → [요약 큐에 추가]
```

## 입력/출력 프로토콜

- 입력: RSS 피드 URL 목록, 크롤링 설정
- 출력: 정규화된 Article 레코드 (title, url, source, content, publishedAt)

```typescript
interface CrawlerSource {
  name: string;
  feedUrl: string;
  category: Category;
  selector?: string; // 본문 CSS 셀렉터 (커스텀)
}

interface CrawledArticle {
  title: string;
  url: string;
  source: string;
  content: string;
  category: Category;
  publishedAt: Date;
}
```

## 에러 핸들링

- 피드 파싱 실패: 해당 소스를 스킵하고 로그에 기록한다. 3회 연속 실패 시 알림.
- 크롤링 차단 (403/429): 해당 소스를 일시 비활성화한다 (1시간 쿨다운).
- 타임아웃: 개별 기사 크롤링은 10초 제한. 초과 시 스킵.
- 인코딩 오류: UTF-8로 강제 변환. 실패 시 스킵.

## 콘텐츠 정규화 규칙

- HTML 태그 제거 (Cheerio)
- 연속 공백/줄바꿈을 단일 공백으로 치환
- 최소 100자 이상인 기사만 저장 (너무 짧은 기사 필터링)
- 최대 10,000자로 잘라서 저장 (LLM 토큰 비용 관리)

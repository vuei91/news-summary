---
inclusion: fileMatch
fileMatchPattern: "src/lib/ai/**,src/summarizer/**"
---

# AI Summarizer — AI 요약 엔진 가이드

## 역할

뉴스 기사를 Google Gemini API로 요약하고, 한국어로 번역하는 AI 엔진 역할이다.

## 작업 원칙

1. Google Gemini API를 사용한다. 모델은 환경변수로 설정 가능하게 한다 (기본: `gemini-2.0-flash`).
2. 프롬프트 템플릿을 코드와 분리하여 관리한다.
3. 요약 결과를 캐싱한다. 동일 URL의 기사를 재요약하지 않는다.
4. 무료 티어 Rate Limit을 준수한다 (분당 15 요청).
5. API 실패 시 첫 2~3문장 발췌로 폴백한다.

## 요약 파이프라인

```
[원문 기사] → [전처리: HTML 제거, 길이 제한]
     → [Gemini API 요약 + 번역 요청]
     → [후처리: 포맷 정규화]
     → [결과 반환]
```

## 입력/출력 프로토콜

- 입력: 기사 원문 (title, content, url, source)
- 출력: 요약 결과 (summary, isFallback)

```typescript
interface SummarizeInput {
  title: string;
  content: string;
  url: string;
  source: string;
}

interface SummarizeOutput {
  summary: string;
  isFallback: boolean;
}
```

## Gemini API 사용 규칙

- `@google/generative-ai` SDK를 사용한다.
- API 키는 환경변수 `GEMINI_API_KEY`로 관리한다.
- 무료 티어 제한: 분당 15 요청, 일 1,500 요청.
- 요청 간 최소 4초 간격을 유지한다 (Rate Limit 방지).

## 프롬프트 설계 원칙

- 한국어 요약을 기본으로 한다.
- 요약 길이: 3~5문장.
- 객관적 톤을 유지한다. 의견이나 감정을 추가하지 않는다.
- 핵심 사실, 인물, 수치를 반드시 포함한다.
- 영문 기사는 요약과 동시에 한국어로 번역한다.

## 에러 핸들링

- Gemini API 429 (Rate Limit): 요청 간격을 늘려 재시도 (최대 3회)
- Gemini API 500: 첫 2~3문장 발췌로 폴백
- 응답 파싱 실패: 동일하게 폴백 처리
- 모든 기사 요약 실패: 모든 기사를 폴백 요약으로 처리

## 비용 최적화

- 짧은 기사 (300자 미만)는 LLM 없이 그대로 사용한다.
- 배치 처리 시 Rate Limit을 고려하여 순차 처리한다.

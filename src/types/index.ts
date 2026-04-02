// === 설정 관련 ===

export interface DigestConfig {
  sources: FeedSource[];
  ai: AIConfig;
  schedule?: string; // cron 표현식 (참고용)
  maxArticlesPerSource?: number; // 소스당 최대 기사 수
}

export interface FeedSource {
  name: string;           // 소스 표시명 (예: "TechCrunch")
  feedUrl: string;        // RSS 피드 URL
  category: string;       // 카테고리 (예: "tech", "world")
  contentSelector?: string; // 본문 추출 CSS 셀렉터 (선택)
  language?: string;      // 소스 언어 (예: "ko", "en") — 기본 "en"
}

export interface EmailConfig {
  to: string;             // 수신 이메일 주소
  from?: string;          // 발신자 표시명
}

export interface AIConfig {
  provider: string;
  model?: string;         // 모델명 (기본: "llama-3.3-70b-versatile")
  language: string;       // 요약 언어 (기본: "ko")
}

// === 기사 관련 ===

export interface CollectedArticle {
  title: string;
  url: string;
  source: string;         // FeedSource.name
  category: string;
  content: string;        // 본문 텍스트
  publishedAt: Date;
  language?: string;      // 소스 언어
}

export interface SummarizedArticle extends CollectedArticle {
  summary: string;        // AI 요약 결과 (한국어)
  englishSummary: string; // 영어 요약 원문
  translatedTitle: string; // 번역된 제목 (한국어)
  isFallback: boolean;    // 폴백 요약 여부
}

// === 다이제스트 ===

export interface Digest {
  articles: SummarizedArticle[];
  generatedAt: Date;
  stats: DigestStats;
}

export interface DigestStats {
  totalCollected: number;
  totalNew: number;
  summarizeSuccess: number;
  summarizeFallback: number;
  summarizeFailed: number;
}

// === 상태 관련 ===

export interface StateData {
  processedArticles: ProcessedEntry[];
  lastRunAt?: string;     // ISO 8601
}

export interface ProcessedEntry {
  url: string;
  processedAt: string;    // ISO 8601
}

// === 이메일 결과 ===

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  attempts: number;
}

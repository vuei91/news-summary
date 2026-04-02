import { describe, it, expect } from "vitest";
import { buildHtml } from "./email-sender.js";
import type { Digest, SummarizedArticle } from "../types/index.js";

function makeArticle(overrides: Partial<SummarizedArticle> = {}): SummarizedArticle {
  return {
    title: "Test Article Title",
    translatedTitle: "테스트 기사 제목",
    url: "https://example.com/article-1",
    source: "Fox News",
    category: "tech",
    content: "Full article content here.",
    summary: "이것은 테스트 기사의 한국어 요약입니다.",
    englishSummary: "This is a test article English summary.",
    publishedAt: new Date("2024-06-15T10:00:00Z"),
    isFallback: false,
    ...overrides,
  };
}

function makeDigest(articles: SummarizedArticle[] = [makeArticle()]): Digest {
  return {
    articles,
    generatedAt: new Date("2024-06-15T12:00:00Z"),
    stats: {
      totalCollected: 20,
      totalNew: 10,
      summarizeSuccess: 8,
      summarizeFallback: 1,
      summarizeFailed: 1,
    },
  };
}

describe("buildHtml", () => {
  it("각 기사의 번역된 제목을 포함한다", () => {
    const html = buildHtml(makeDigest());
    expect(html).toContain("테스트 기사 제목");
  });

  it("각 기사의 요약을 포함한다", () => {
    const html = buildHtml(makeDigest());
    expect(html).toContain("이것은 테스트 기사의 한국어 요약입니다.");
  });

  it("각 기사의 영어 요약을 포함한다", () => {
    const html = buildHtml(makeDigest());
    expect(html).toContain("This is a test article English summary.");
  });

  it("각 기사의 원문 링크를 포함한다", () => {
    const html = buildHtml(makeDigest());
    expect(html).toContain("https://example.com/article-1");
    expect(html).toContain("Test Article Title");
  });

  it("각 기사의 소스명을 포함한다", () => {
    const html = buildHtml(makeDigest());
    expect(html).toContain("Fox News");
  });

  it("각 기사의 발행일을 포함한다", () => {
    const html = buildHtml(makeDigest());
    expect(html).toContain("2024");
    expect(html).toContain("6");
    expect(html).toContain("15");
  });

  it("DigestStats를 포함한다", () => {
    const html = buildHtml(makeDigest());
    expect(html).toContain("20");  // totalCollected
    expect(html).toContain("10");  // totalNew
    expect(html).toContain("8");   // summarizeSuccess
    expect(html).toContain("1");   // summarizeFallback & summarizeFailed
  });

  it("생성 시간을 포함한다", () => {
    const html = buildHtml(makeDigest());
    expect(html).toContain("생성");
  });

  it("카테고리별로 그룹핑한다", () => {
    const articles = [
      makeArticle({ category: "tech", translatedTitle: "기술 기사" }),
      makeArticle({ category: "world", translatedTitle: "세계 기사", url: "https://example.com/2" }),
      makeArticle({ category: "tech", translatedTitle: "기술 기사 2", url: "https://example.com/3" }),
    ];
    const html = buildHtml(makeDigest(articles));
    expect(html).toContain("기술");
    expect(html).toContain("세계");
    // tech section should show 2건
    expect(html).toContain("2건");
    expect(html).toContain("1건");
  });

  it("폴백 기사에 폴백 표시를 포함한다", () => {
    const article = makeArticle({ isFallback: true });
    const html = buildHtml(makeDigest([article]));
    expect(html).toContain("폴백");
  });

  it("폴백이 아닌 기사에는 폴백 표시가 없다", () => {
    const article = makeArticle({ isFallback: false });
    const html = buildHtml(makeDigest([article]));
    // The word 폴백 appears in stats (summarizeFallback label) but not as a badge
    expect(html).not.toContain("fef3c7"); // fallback badge background color
  });

  it("유효한 HTML 문서를 반환한다", () => {
    const html = buildHtml(makeDigest());
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
    expect(html).toContain('lang="ko"');
  });

  it("HTML 특수문자를 이스케이프한다", () => {
    const article = makeArticle({
      translatedTitle: '<script>alert("xss")</script>',
      summary: "Tom & Jerry <b>bold</b>",
    });
    const html = buildHtml(makeDigest([article]));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Tom &amp; Jerry");
  });

  it("빈 기사 목록에서도 유효한 HTML을 반환한다", () => {
    const digest = makeDigest([]);
    const html = buildHtml(digest);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("뉴스 다이제스트");
  });

  it("여러 기사의 모든 필수 정보를 포함한다", () => {
    const articles = [
      makeArticle({
        translatedTitle: "첫 번째 기사",
        summary: "첫 번째 요약",
        url: "https://example.com/1",
        source: "Source A",
      }),
      makeArticle({
        translatedTitle: "두 번째 기사",
        summary: "두 번째 요약",
        url: "https://example.com/2",
        source: "Source B",
      }),
    ];
    const html = buildHtml(makeDigest(articles));
    for (const a of articles) {
      expect(html).toContain(a.translatedTitle);
      expect(html).toContain(a.summary);
      expect(html).toContain(a.url);
      expect(html).toContain(a.source);
    }
  });
});

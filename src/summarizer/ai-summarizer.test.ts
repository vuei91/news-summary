import { describe, it, expect } from "vitest";
import { extractFallbackSummary } from "./ai-summarizer.js";

describe("extractFallbackSummary", () => {
  it("빈 문자열이면 빈 문자열을 반환한다", () => {
    expect(extractFallbackSummary("")).toBe("");
    expect(extractFallbackSummary("   ")).toBe("");
  });

  it("단일 문장을 그대로 반환한다", () => {
    const content = "This is a single sentence.";
    expect(extractFallbackSummary(content)).toBe("This is a single sentence.");
  });

  it("2문장을 모두 반환한다", () => {
    const content = "First sentence. Second sentence.";
    expect(extractFallbackSummary(content)).toBe(
      "First sentence. Second sentence."
    );
  });

  it("3문장까지만 발췌한다", () => {
    const content =
      "First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence.";
    expect(extractFallbackSummary(content)).toBe(
      "First sentence. Second sentence. Third sentence."
    );
  });

  it("물음표와 느낌표도 문장 종결로 인식한다", () => {
    const content = "What happened? It was amazing! Then it ended.";
    expect(extractFallbackSummary(content)).toBe(
      "What happened? It was amazing! Then it ended."
    );
  });

  it("문장 구분이 없으면 첫 200자를 반환한다", () => {
    const content = "a".repeat(300);
    const result = extractFallbackSummary(content);
    expect(result.length).toBe(200);
  });

  it("실제 뉴스 스타일 본문에서 첫 3문장을 발췌한다", () => {
    const content =
      "The Federal Reserve announced a rate cut on Wednesday. Markets responded positively to the news. Investors expect further cuts in the coming months. Analysts remain cautious about long-term effects.";
    const result = extractFallbackSummary(content);
    expect(result).toBe(
      "The Federal Reserve announced a rate cut on Wednesday. Markets responded positively to the news. Investors expect further cuts in the coming months."
    );
  });
});

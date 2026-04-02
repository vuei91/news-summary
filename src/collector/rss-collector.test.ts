import { describe, it, expect } from "vitest";
import { RSSCollector } from "./rss-collector.js";

describe("RSSCollector.extractTextFromHtml", () => {
  it("기본 HTML에서 텍스트를 추출한다", () => {
    const html = "<html><body><p>Hello World</p></body></html>";
    const result = RSSCollector.extractTextFromHtml(html);
    expect(result).toBe("Hello World");
  });

  it("script와 style 태그를 제거한다", () => {
    const html = `
      <html><body>
        <script>var x = 1;</script>
        <style>.foo { color: red; }</style>
        <p>본문 텍스트</p>
      </body></html>
    `;
    const result = RSSCollector.extractTextFromHtml(html);
    expect(result).toBe("본문 텍스트");
    expect(result).not.toContain("var x");
    expect(result).not.toContain("color");
  });

  it("nav, footer, header, aside를 제거한다", () => {
    const html = `
      <html><body>
        <header><a href="/">Home</a></header>
        <nav><a href="/about">About</a></nav>
        <article><p>기사 본문입니다.</p></article>
        <aside>광고 영역</aside>
        <footer>Copyright 2024</footer>
      </body></html>
    `;
    const result = RSSCollector.extractTextFromHtml(html);
    expect(result).toBe("기사 본문입니다.");
    expect(result).not.toContain("Home");
    expect(result).not.toContain("About");
    expect(result).not.toContain("광고");
    expect(result).not.toContain("Copyright");
  });

  it("article 태그가 있으면 우선 추출한다", () => {
    const html = `
      <html><body>
        <div>사이드바 내용</div>
        <article><p>핵심 기사 내용</p></article>
        <div>푸터 내용</div>
      </body></html>
    `;
    const result = RSSCollector.extractTextFromHtml(html);
    expect(result).toBe("핵심 기사 내용");
  });

  it("article이 없으면 main 태그를 사용한다", () => {
    const html = `
      <html><body>
        <div>헤더</div>
        <main><p>메인 콘텐츠</p></main>
        <div>푸터</div>
      </body></html>
    `;
    const result = RSSCollector.extractTextFromHtml(html);
    expect(result).toBe("메인 콘텐츠");
  });

  it("article/main이 없으면 body에서 추출한다", () => {
    const html = `
      <html><body>
        <div><p>일반 페이지 내용</p></div>
      </body></html>
    `;
    const result = RSSCollector.extractTextFromHtml(html);
    expect(result).toBe("일반 페이지 내용");
  });

  it("연속 공백을 하나로 정규화한다", () => {
    const html = "<html><body><p>Hello    World\n\n\tTest</p></body></html>";
    const result = RSSCollector.extractTextFromHtml(html);
    expect(result).toBe("Hello World Test");
  });

  it("광고 관련 클래스를 가진 요소를 제거한다", () => {
    const html = `
      <html><body>
        <article>
          <p>기사 내용</p>
          <div class="ad-banner">광고입니다</div>
          <div class="advertisement-box">스폰서</div>
        </article>
      </body></html>
    `;
    const result = RSSCollector.extractTextFromHtml(html);
    expect(result).toBe("기사 내용");
    expect(result).not.toContain("광고");
    expect(result).not.toContain("스폰서");
  });

  it("빈 HTML에서 빈 문자열을 반환한다", () => {
    const html = "<html><body></body></html>";
    const result = RSSCollector.extractTextFromHtml(html);
    expect(result).toBe("");
  });

  it("HTML 태그가 결과에 포함되지 않는다", () => {
    const html = `
      <html><body>
        <article>
          <h1>제목</h1>
          <p>단락 <strong>강조</strong> 텍스트</p>
          <a href="http://example.com">링크</a>
        </article>
      </body></html>
    `;
    const result = RSSCollector.extractTextFromHtml(html);
    expect(result).not.toMatch(/<[^>]+>/);
    expect(result).toContain("제목");
    expect(result).toContain("강조");
    expect(result).toContain("링크");
  });
});

// RSS 피드 수집 모듈

import Parser from "rss-parser";
import * as cheerio from "cheerio";
import type { FeedSource, CollectedArticle } from "../types/index.js";
import type { StateStore } from "../state/state-store.js";

const parser = new Parser();

export class RSSCollector {
  private stateStore: StateStore;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  /**
   * 모든 소스에서 기사를 수집한다.
   * 개별 소스 실패 시 건너뛰고 나머지를 계속 수집한다.
   */
  async collectAll(sources: FeedSource[], maxPerSource?: number): Promise<CollectedArticle[]> {
    const articles: CollectedArticle[] = [];

    for (const source of sources) {
      try {
        let collected = await this.collectFeed(source);
        if (maxPerSource && maxPerSource > 0) {
          collected = collected.slice(0, maxPerSource);
        }
        articles.push(...collected);
      } catch (error) {
        console.error(
          `[RSSCollector] 소스 수집 실패 (${source.name}):`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    return articles;
  }

  /**
   * 단일 RSS 피드에서 기사를 수집한다.
   * 이미 처리된 URL은 건너뛴다.
   * 본문은 RSS 피드의 description/content를 우선 사용하고,
   * 없을 때만 URL 크롤링을 시도한다 (속도 우선).
   */
  async collectFeed(source: FeedSource): Promise<CollectedArticle[]> {
    const feed = await parser.parseURL(source.feedUrl);
    const articles: CollectedArticle[] = [];

    for (const item of feed.items) {
      const url = item.link;
      if (!url) continue;

      // 중복 필터링
      if (this.stateStore.isProcessed(url)) continue;

      // RSS 피드 콘텐츠를 우선 사용 (크롤링 없이 빠르게)
      let content = item["content:encoded"] ?? item.contentSnippet ?? item.content ?? "";

      // RSS에 콘텐츠가 없을 때만 크롤링 시도
      if (!content.trim()) {
        try {
          content = await this.extractContent(url);
        } catch {
          content = "";
        }
      }

      articles.push({
        title: item.title ?? "(제목 없음)",
        url,
        source: source.name,
        category: source.category,
        content,
        publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
        language: source.language,
      });
    }

    return articles;
  }

  /**
   * URL에서 HTML을 가져와 본문 텍스트를 추출한다.
   * script, style, nav, footer, header, aside, 광고 영역을 제거하고
   * article/main 태그 우선, 없으면 body에서 추출한다.
   */
  async extractContent(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; NewsDigestBot/1.0)",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    return RSSCollector.extractTextFromHtml(html);
  }

  /**
   * HTML 문자열에서 본문 텍스트를 추출한다.
   * 정적 메서드로 분리하여 단위 테스트가 용이하도록 한다.
   */
  static extractTextFromHtml(html: string): string {
    const $ = cheerio.load(html);

    // 불필요한 요소 제거
    $("script, style, noscript, iframe, svg, nav, footer, header, aside").remove();
    $('[role="navigation"], [role="banner"], [role="contentinfo"]').remove();
    $('[class*="ad-"], [class*="advertisement"], [class*="sidebar"], [class*="menu"], [class*="nav"]').remove();
    $('[id*="ad-"], [id*="advertisement"], [id*="sidebar"], [id*="menu"], [id*="nav"]').remove();

    // article 또는 main 태그 우선 추출
    let target = $("article");
    if (target.length === 0) {
      target = $("main");
    }
    if (target.length === 0) {
      target = $("body");
    }

    const text = target
      .text()
      .replace(/\s+/g, " ")
      .trim();

    return text;
  }
}

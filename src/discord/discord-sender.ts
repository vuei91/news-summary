// 디스코드 웹훅 발송 모듈
// X(트위터) 복사-붙여넣기에 최적화된 플레인 텍스트 형식

import type { Digest, SummarizedArticle } from "../types/index.js";

const MAX_CONTENT_LENGTH = 2000; // 디스코드 메시지 최대 길이

export class DiscordSender {
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  async send(digest: Digest): Promise<{ success: boolean; error?: string }> {
    try {
      const { stats } = digest;
      const date = new Date(digest.generatedAt).toLocaleDateString("ko-KR", {
        year: "numeric", month: "long", day: "numeric",
      });

      // 헤더 메시지
      await this.postMessage({
        content: `📰 뉴스 다이제스트 — ${date}\n수집: ${stats.totalCollected}건 | 요약: ${stats.summarizeSuccess} | 폴백: ${stats.summarizeFallback}`,
      });

      // 기사별로 X 붙여넣기용 플레인 텍스트 전송
      const grouped = this.groupBySource(digest.articles);

      for (const [source, articles] of grouped) {
        // 소스 구분 헤더
        await this.postMessage({ content: `\n🗞️ ${source}` });

        for (const article of articles) {
          const text = this.buildPlainText(article);
          await this.postMessage({ content: text });
        }
      }

      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  }

  /**
   * X(트위터) 붙여넣기용 플레인 텍스트를 생성한다.
   * embed 없이 순수 텍스트만 사용하여 복사가 깔끔하다.
   */
  private buildPlainText(article: SummarizedArticle): string {
    const title = article.translatedTitle || article.title;
    const summary = article.summary || "(요약 없음)";
    const tag = article.isFallback ? "⚠️" : "✅";

    const lines = [
      `${tag} [제목] ${title}`,
      ``,
      `[요약] ${summary}`,
      ``,
      `[링크] ${article.url}`,
    ];

    return lines.join("\n").slice(0, MAX_CONTENT_LENGTH);
  }

  private async postMessage(body: Record<string, unknown>): Promise<void> {
    const res = await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      if (res.status === 429) {
        const data = await res.json() as { retry_after?: number };
        const wait = (data.retry_after ?? 1) * 1000;
        console.log(`  [Discord] Rate limit — ${Math.ceil(wait / 1000)}초 대기...`);
        await new Promise((r) => setTimeout(r, wait));
        return this.postMessage(body);
      }
      throw new Error(`Discord webhook 실패: ${res.status} ${res.statusText}`);
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  private groupBySource(articles: SummarizedArticle[]): Map<string, SummarizedArticle[]> {
    const groups = new Map<string, SummarizedArticle[]>();
    for (const a of articles) {
      if (!groups.has(a.source)) groups.set(a.source, []);
      groups.get(a.source)!.push(a);
    }
    return groups;
  }
}

// 디스코드 웹훅 발송 모듈

import type { Digest, SummarizedArticle } from "../types/index.js";

const MAX_EMBED_DESCRIPTION = 4096;
const MAX_EMBEDS_PER_MESSAGE = 10;

interface DiscordEmbed {
  title: string;
  description: string;
  url?: string;
  color: number;
  footer?: { text: string };
}

export class DiscordSender {
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  async send(digest: Digest): Promise<{ success: boolean; error?: string }> {
    try {
      const grouped = this.groupBySource(digest.articles);

      // 헤더 메시지
      const { stats } = digest;
      const date = new Date(digest.generatedAt).toLocaleDateString("ko-KR", {
        year: "numeric", month: "long", day: "numeric",
      });
      await this.postMessage({
        content: `📰 **뉴스 다이제스트** — ${date}\n수집: ${stats.totalCollected}건 | 요약 성공: ${stats.summarizeSuccess} | 폴백: ${stats.summarizeFallback}`,
      });

      // 소스별로 Embed 전송
      for (const [source, articles] of grouped) {
        const embeds = articles.map((a) => this.buildEmbed(a));

        // 디스코드는 한 번에 최대 10개 embed
        for (let i = 0; i < embeds.length; i += MAX_EMBEDS_PER_MESSAGE) {
          const chunk = embeds.slice(i, i + MAX_EMBEDS_PER_MESSAGE);

          // 첫 청크에만 소스 이름 표시
          const content = i === 0 ? `\n**🗞️ ${source}**` : undefined;
          await this.postMessage({ content, embeds: chunk });
        }
      }

      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  }

  private buildEmbed(article: SummarizedArticle): DiscordEmbed {
    const title = article.translatedTitle || article.title;
    const summary = article.summary || "(요약 없음)";
    const color = article.isFallback ? 0xd97706 : 0x3b82f6;

    // X(트위터) 붙여넣기용: 소스 + 요약 + 링크
    const descForCopy = `[요약]\n${summary}\n\n[링크] ${article.url}`;

    return {
      title: `[${article.source}] ${title}`.slice(0, 256),
      description: descForCopy.slice(0, MAX_EMBED_DESCRIPTION),
      url: article.url,
      color,
      footer: { text: `${article.source} · ${article.isFallback ? "폴백" : "AI 요약"}` },
    };
  }

  private async postMessage(body: Record<string, unknown>): Promise<void> {
    const res = await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      // 429 rate limit 대응
      if (res.status === 429) {
        const data = await res.json() as { retry_after?: number };
        const wait = (data.retry_after ?? 1) * 1000;
        console.log(`  [Discord] Rate limit — ${Math.ceil(wait / 1000)}초 대기...`);
        await new Promise((r) => setTimeout(r, wait));
        return this.postMessage(body);
      }
      throw new Error(`Discord webhook 실패: ${res.status} ${res.statusText}`);
    }

    // 디스코드 rate limit 방지 딜레이
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

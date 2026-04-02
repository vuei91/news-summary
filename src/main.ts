// 파이프라인 오케스트레이터 — 진입점
// 설정 로드 → 상태 로드 → RSS 수집 → 중복 필터링 → AI 요약 → 디스코드 발송 → 상태 업데이트

import "dotenv/config";
import { loadConfig, loadEnvConfig } from "./config/config-loader.js";
import { StateStore } from "./state/state-store.js";
import { RSSCollector } from "./collector/rss-collector.js";
import { AISummarizer } from "./summarizer/ai-summarizer.js";
import { DiscordSender } from "./discord/discord-sender.js";
import type { Digest, DigestStats, SummarizedArticle } from "./types/index.js";

async function main(): Promise<void> {
  const startTime = new Date();
  console.log(`[Digest] 파이프라인 시작: ${startTime.toISOString()}`);

  // 1. 설정 로드
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const configPath = args[0] ?? "config.json";
  console.log(`[Digest] 설정 파일: ${configPath}`);

  const config = loadConfig(configPath);
  const envConfig = loadEnvConfig();

  // 2. 상태 로드
  const stateStore = new StateStore("state.json");
  console.log(`[Digest] 상태 로드 완료`);

  // 3. RSS 수집
  const collector = new RSSCollector(stateStore);
  const articles = await collector.collectAll(config.sources, config.maxArticlesPerSource);
  console.log(`[Digest] 수집된 기사: ${articles.length}건`);

  // 4. 새 기사가 없으면 종료
  if (articles.length === 0) {
    console.log(`[Digest] 새로운 기사가 없습니다.`);
    return;
  }

  // 4-1. --rss-only: 수집된 기사만 소스별로 출력하고 종료
  if (process.argv.includes("--rss-only")) {
    const bySource = new Map<string, typeof articles>();
    for (const a of articles) {
      if (!bySource.has(a.source)) bySource.set(a.source, []);
      bySource.get(a.source)!.push(a);
    }
    for (const [source, items] of bySource) {
      console.log(`\n[${source}] — ${items.length}건`);
      console.log("-".repeat(60));
      for (const a of items) {
        console.log(`  • ${a.title}`);
        console.log(`    ${a.url}`);
      }
    }
    console.log(`\n[Digest] 총 ${articles.length}건 수집 완료`);
    return;
  }

  // 5. AI 요약
  const summarizer = new AISummarizer(envConfig.aiApiKey, config.ai.model);
  console.log(`[Digest] AI 요약 시작 — 모델: ${config.ai.model}, ${articles.length}건...`);
  const summarized: SummarizedArticle[] = await summarizer.summarizeBatch(articles);

  // 6. DigestStats 집계
  const stats: DigestStats = {
    totalCollected: articles.length,
    totalNew: articles.length,
    summarizeSuccess: summarized.filter((a) => !a.isFallback).length,
    summarizeFallback: summarized.filter((a) => a.isFallback).length,
    summarizeFailed: 0,
  };

  console.log(
    `[Digest] 요약 완료 — 성공: ${stats.summarizeSuccess}, 폴백: ${stats.summarizeFallback}`,
  );

  // 7. Digest 구성
  const digest: Digest = {
    articles: summarized,
    generatedAt: new Date(),
    stats,
  };

  // 8. --dry-run이면 발송 건너뛰기
  if (process.argv.includes("--dry-run")) {
    console.log(`[Digest] --dry-run 모드: 발송을 건너뜁니다.`);
  } else {
    // 9. 디스코드 발송
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL ?? envConfig.discordWebhookUrl;
    if (!webhookUrl) {
      console.error(`[Digest] DISCORD_WEBHOOK_URL 환경변수가 설정되지 않았습니다.`);
      process.exit(1);
    }

    const discord = new DiscordSender(webhookUrl);
    console.log(`[Digest] 디스코드 발송 중...`);
    const result = await discord.send(digest);

    if (result.success) {
      console.log(`[Digest] 디스코드 발송 성공`);
    } else {
      console.error(`[Digest] 디스코드 발송 실패: ${result.error}`);
      process.exit(1);
    }
  }

  // 10. 상태 업데이트
  const processedUrls = summarized.map((a) => a.url);
  stateStore.addProcessed(processedUrls);
  stateStore.cleanup(30);
  stateStore.save(stateStore.getState());
  console.log(`[Digest] 상태 저장 완료 (${processedUrls.length}건 추가)`);

  // 11. 최종 로그
  const elapsed = ((Date.now() - startTime.getTime()) / 1000).toFixed(1);
  console.log(`[Digest] 파이프라인 완료 (소요: ${elapsed}초)`);
}

main().catch((error) => {
  console.error(`[Digest] 치명적 오류:`, error instanceof Error ? error.message : error);
  process.exit(1);
});

// 파이프라인 오케스트레이터 — 진입점
// 설정 로드 → 상태 로드 → RSS 수집 → 중복 필터링 → AI 요약 → 이메일 발송 → 상태 업데이트

import "dotenv/config";
import { loadConfig, loadEnvConfig } from "./config/config-loader.js";
import { StateStore } from "./state/state-store.js";
import { RSSCollector } from "./collector/rss-collector.js";
import { AISummarizer } from "./summarizer/ai-summarizer.js";
import { EmailSender } from "./email/email-sender.js";
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
    console.log(`[Digest] 파이프라인 종료: ${new Date().toISOString()}`);
    return;
  }

  // 4-1. --rss-only: 수집된 기사만 카테고리별로 출력하고 종료
  if (process.argv.includes("--rss-only")) {
    const byCategory = new Map<string, typeof articles>();
    for (const a of articles) {
      const cat = a.source ?? "기타";
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(a);
    }

    for (const [source, items] of byCategory) {
      console.log(`\n[${ source }] — ${items.length}건`);
      console.log("-".repeat(60));
      for (const a of items) {
        console.log(`  • ${a.title}`);
        console.log(`    ${a.url}`);
      }
    }
    console.log(`\n[Digest] 총 ${articles.length}건 수집 완료`);
    return;
  }

  // 5. AI 요약 (Ollama 로컬 서버)
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
    `[Digest] 요약 완료 — 성공: ${stats.summarizeSuccess}, 폴백: ${stats.summarizeFallback}, 실패: ${stats.summarizeFailed}`,
  );

  // 7. 요약 결과 로그 출력 (테스트 모드)
  const dryRun = process.argv.includes("--dry-run");

  console.log(`\n${"=".repeat(80)}`);
  console.log(`  요약 결과 미리보기 (${summarized.length}건)`);
  console.log(`${"=".repeat(80)}`);
  for (const a of summarized) {
    console.log(`\n--- [${a.isFallback ? "폴백" : "AI"}] ---`);
    console.log(`  원제: ${a.title}`);
    console.log(`  번역: ${a.translatedTitle}`);
    console.log(`  영문요약: ${a.englishSummary}`);
    console.log(`  한글요약: ${a.summary}`);
    console.log(`  URL: ${a.url}`);
  }
  console.log(`\n${"=".repeat(80)}\n`);

  if (dryRun) {
    console.log(`[Digest] --dry-run 모드: 이메일 발송을 건너뜁니다.`);
  } else {
    // 8. Digest 구성
    const digest: Digest = {
      articles: summarized,
      generatedAt: new Date(),
      stats,
    };

    // 9. 이메일 발송
    const emailSender = new EmailSender({
      host: envConfig.smtpHost,
      port: envConfig.smtpPort,
      user: envConfig.smtpUser,
      pass: envConfig.smtpPass,
      fromName: config.email.from,
    });

    console.log(`[Digest] 이메일 발송 중... (수신: ${config.email.to})`);
    const sendResult = await emailSender.send(digest, config.email.to);

    if (sendResult.success) {
      console.log(`[Digest] 이메일 발송 성공 (messageId: ${sendResult.messageId}, 시도: ${sendResult.attempts}회)`);

      // 10. 상태 업데이트 — 발송 성공 시에만
      const processedUrls = summarized.map((a) => a.url);
      stateStore.addProcessed(processedUrls);
      stateStore.cleanup(30);
      stateStore.save(stateStore.getState());
      console.log(`[Digest] 상태 저장 완료 (${processedUrls.length}건 추가)`);
    } else {
      console.error(`[Digest] 이메일 발송 실패: ${sendResult.error} (시도: ${sendResult.attempts}회)`);
      process.exit(1);
    }
  }

  // 10. 최종 로그
  const endTime = new Date();
  const elapsed = ((endTime.getTime() - startTime.getTime()) / 1000).toFixed(1);
  console.log(`[Digest] 파이프라인 완료: ${endTime.toISOString()} (소요: ${elapsed}초)`);
  console.log(
    `[Digest] 통계 — 수집: ${stats.totalCollected}건, 요약성공: ${stats.summarizeSuccess}, 폴백: ${stats.summarizeFallback}, 실패: ${stats.summarizeFailed}`,
  );
}

main().catch((error) => {
  console.error(`[Digest] 치명적 오류:`, error instanceof Error ? error.message : error);
  process.exit(1);
});

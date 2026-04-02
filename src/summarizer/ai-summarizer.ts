// AI 요약/번역 모듈 — Ollama 로컬 서버 연동 (OpenAI 호환)
// 단건 프롬프트를 병렬로 Ollama에 던져 처리 속도를 높인다.
// Ollama는 내부적으로 큐잉하므로 과부하 걱정 없이 전부 동시에 보낼 수 있다.

import OpenAI from "openai";
import type { CollectedArticle, SummarizedArticle } from "../types/index.js";

const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
const MAX_CONTENT_PER_ARTICLE = 1200;

/**
 * 기사 본문에서 첫 2~3문장을 발췌하여 폴백 요약을 생성한다.
 */
export function extractFallbackSummary(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return "";

  const sentences = trimmed.match(/[^.!?]*[.!?]+(?:\s|$)/g);
  if (!sentences || sentences.length === 0) {
    return trimmed.slice(0, 200).trim();
  }
  return sentences.slice(0, 3).join("").trim();
}

export class AISummarizer {
  private client: OpenAI;
  private modelName: string;

  constructor(apiKey?: string, model?: string, baseURL?: string) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
      baseURL: baseURL ?? DEFAULT_BASE_URL,
    });
    this.modelName = model ?? DEFAULT_MODEL;
  }

  /**
   * 모든 기사를 병렬로 Ollama에 요청한다.
   * 클라우드 API rate limit을 고려하여 약간의 딜레이를 두고 병렬 요청한다.
   * 각 건이 완료되는 즉시 로그를 출력한다.
   */
  async summarizeBatch(articles: CollectedArticle[]): Promise<SummarizedArticle[]> {
    if (articles.length === 0) return [];

    console.log(`  [AI] 총 ${articles.length}건을 병렬로 요청합니다.`);

    let completed = 0;
    const total = articles.length;

    const promises = articles.map(async (article, i) => {
      // rate limit 방지: 요청 간 2초 간격
      await new Promise((r) => setTimeout(r, i * 2000));

      const result = await this.summarizeOne(article);
      completed++;

      return result;
    });

    const results = await Promise.all(promises);

    const success = results.filter((r) => !r.isFallback).length;
    const fallback = results.filter((r) => r.isFallback).length;
    console.log(`  [AI] 전체 요약 완료 — 성공: ${success}, 폴백: ${fallback}`);

    return results;
  }

  private async summarizeOne(article: CollectedArticle): Promise<SummarizedArticle> {
    const content = article.content.slice(0, MAX_CONTENT_PER_ARTICLE);
    const isKorean = article.language === "ko";

    const prompt = isKorean
      ? `당신은 전문 뉴스 편집자입니다. 반드시 한국어(한글)로만 작성하세요.

제목: ${article.title}
본문: ${content}

위 기사를 2~3문장으로 요약하세요.

JSON 객체만 반환하세요 (마크다운, 설명 없이):
{"summary":"한국어 요약","translatedTitle":"${article.title}","englishSummary":"한국어 요약"}`
      : `You are a professional news translator. Translate into Korean (한국어, Hangul script only). NEVER use Chinese characters (漢字/한자) or Japanese. Use only Hangul (가나다) and standard Korean.

Title: ${article.title}
Content: ${content}

Do the following:
1. Summarize the article in 2-3 sentences in English.
2. Translate your English summary into natural Korean (한국어/Hangul only).
3. Translate the article title into natural Korean (한국어/Hangul only).

Respond ONLY with a JSON object (no markdown, no explanation):
{"englishSummary":"...","summary":"Korean translation","translatedTitle":"Korean translation"}`;

    try {
      const completion = await this.requestWithRetry(prompt);

      const text = completion.choices[0]?.message?.content?.trim() ?? "";
      const parsed = this.parseResponse(text);

      if (parsed.summary && parsed.translatedTitle) {
        return { ...article, ...parsed, isFallback: false };
      }

      return this.fallback(article);
    } catch (error) {
      console.error(`  [AI] 요약 실패 (${article.title}):`, error instanceof Error ? error.message : error);
      return this.fallback(article);
    }
  }

  /**
   * 429 rate limit 에러 시 대기 후 재시도한다. 최대 3회.
   */
  private async requestWithRetry(prompt: string, maxRetries = 3): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.client.chat.completions.create({
          model: this.modelName,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
        });
      } catch (error: unknown) {
        const status = (error as { status?: number }).status;
        if (status === 429 && attempt < maxRetries) {
          // 에러 메시지에서 대기 시간 추출, 없으면 기본 10초
          const msg = error instanceof Error ? error.message : "";
          const waitMatch = msg.match(/(\d+\.?\d*)\s*s/);
          const waitSec = waitMatch ? Math.ceil(parseFloat(waitMatch[1])) + 1 : 10;
          console.log(`  [AI] Rate limit — ${waitSec}초 대기 후 재시도 (${attempt}/${maxRetries})...`);
          await new Promise((r) => setTimeout(r, waitSec * 1000));
          continue;
        }
        throw error;
      }
    }
    throw new Error("최대 재시도 횟수 초과");
  }

  private parseResponse(text: string): {
    englishSummary: string;
    summary: string;
    translatedTitle: string;
  } {
    let cleaned = text;

    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      cleaned = codeBlockMatch[1].trim();
    }

    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      cleaned = objMatch[0];
    }

    try {
      const parsed = JSON.parse(cleaned);
      return {
        englishSummary: String(parsed.englishSummary ?? ""),
        summary: String(parsed.summary ?? ""),
        translatedTitle: String(parsed.translatedTitle ?? ""),
      };
    } catch {
      // JSON 파싱 실패 시 값 안의 이스케이프 안 된 따옴표를 수정 후 재시도
      const fixed = cleaned
        .replace(/([{,]\s*"(?:englishSummary|summary|translatedTitle)"\s*:\s*")([\s\S]*?)("(?:\s*[,}]))/g,
          (_match, prefix, value, suffix) => {
            const escaped = value.replace(/(?<!\\)"/g, '\\"');
            return prefix + escaped + suffix;
          });

      try {
        const parsed = JSON.parse(fixed);
        return {
          englishSummary: String(parsed.englishSummary ?? ""),
          summary: String(parsed.summary ?? ""),
          translatedTitle: String(parsed.translatedTitle ?? ""),
        };
      } catch {
        // 정규식으로 직접 추출
        const extract = (key: string): string => {
          const re = new RegExp(`"${key}"\\s*:\\s*"([\\s\\S]*?)(?:"\\s*[,}])`);
          const m = cleaned.match(re);
          return m ? m[1].replace(/\\"/g, '"') : "";
        };
        return {
          englishSummary: extract("englishSummary"),
          summary: extract("summary"),
          translatedTitle: extract("translatedTitle"),
        };
      }
    }
  }

  private fallback(article: CollectedArticle): SummarizedArticle {
    return {
      ...article,
      summary: extractFallbackSummary(article.content),
      englishSummary: extractFallbackSummary(article.content),
      translatedTitle: article.title,
      isFallback: true,
    };
  }
}

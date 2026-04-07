// AI 요약/번역 모듈 — Groq API 연동 (OpenAI 호환)
// 단건 프롬프트를 병렬로 Groq에 던져 처리 속도를 높인다.
// rate limit(429) 발생 시 자동 재시도한다.

import OpenAI from "openai";
import type { CollectedArticle, SummarizedArticle } from "../types/index.js";

const DEFAULT_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
const MAX_CONTENT_PER_ARTICLE = 1200;
// llama-4-scout: TPM 30K, RPM 30 → 요청당 ~1.5K 토큰 기준 분당 ~20건 가능
const REQUEST_DELAY_MS = 3000;

/**
 * 기사 본문에서 첫 2~3문장을 발췌하여 폴백 요약을 생성한다.
 */
export function extractFallbackSummary(content: string): string {
  const stripped = content
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return "";

  const sentences = stripped.match(/[^.!?]*[.!?]+(?:\s|$)/g);
  if (!sentences || sentences.length === 0) {
    return stripped.slice(0, 200).trim();
  }
  return sentences.slice(0, 3).join("").trim();
}

export class AISummarizer {
  private client: OpenAI;
  private modelName: string;

  constructor(apiKey?: string, model?: string, baseURL?: string) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.GROQ_API_KEY,
      baseURL: baseURL ?? DEFAULT_BASE_URL,
    });
    this.modelName = model ?? DEFAULT_MODEL;
  }

  /**
   * 모든 기사를 병렬로 Groq에 요청한다.
   * rate limit을 고려하여 약간의 딜레이를 두고 병렬 요청한다.
   */
  async summarizeBatch(
    articles: CollectedArticle[],
  ): Promise<SummarizedArticle[]> {
    if (articles.length === 0) return [];

    console.log(`  [AI] 총 ${articles.length}건 요약 요청`);

    // TPM 제한을 고려하여 순차 처리한다.
    const results: SummarizedArticle[] = [];
    for (const article of articles) {
      results.push(await this.summarizeOne(article));
      if (results.length < articles.length) {
        await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
      }
    }
    return results;
  }

  private async summarizeOne(
    article: CollectedArticle,
  ): Promise<SummarizedArticle> {
    const raw = article.content.slice(0, MAX_CONTENT_PER_ARTICLE);
    const content = raw
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const isKorean = article.language === "ko";

    const prompt = isKorean
      ? `당신은 전문 뉴스 편집자입니다. 반드시 한국어(한글)로만 작성하세요.

제목: ${article.title}
본문: ${content}

위 기사를 2~3문장으로 요약하세요.

JSON 객체만 반환하세요 (마크다운, 설명 없이):
{"summary":"한국어 요약","translatedTitle":"${article.title}","englishSummary":"한국어 요약"}`
      : `You are a Korean news translator. Your output language is Korean written EXCLUSIVELY in Hangul (한글).

STRICT RULES:
- Use ONLY Hangul (가-힣), Arabic numerals (0-9), basic Latin letters for proper nouns, and standard punctuation.
- ABSOLUTELY FORBIDDEN characters: Chinese/CJK (漢字), Japanese (カタカナ/ひらがな), Thai, Arabic, Cyrillic, or ANY non-Korean script.
- Transliterate all foreign names into Hangul (e.g., "South Carolina" → "사우스캐롤라이나", "Don Staley" → "돈 스테일리", "UConn" → "유콘").
- Write natural, fluent Korean sentences a native speaker would use.

Title: ${article.title}
Content: ${content}

Tasks:
1. Summarize the article in 2-3 sentences in English.
2. Translate the English summary into Korean using ONLY Hangul.
3. Translate the article title into Korean using ONLY Hangul.

Respond with a JSON object ONLY (no markdown, no explanation):
{"englishSummary":"English summary here","summary":"한글로만 작성된 요약","translatedTitle":"한글로만 작성된 제목"}`;

    try {
      const completion = await this.requestWithRetry(prompt);
      const text = completion.choices[0]?.message?.content?.trim() ?? "";

      if (!text) {
        console.warn(`  [AI] 빈 응답 (${article.title}) — 폴백 처리`);
        return this.fallback(article);
      }

      const parsed = this.parseResponse(text);

      if (parsed.summary && parsed.translatedTitle) {
        return { ...article, ...parsed, isFallback: false };
      }

      console.warn(
        `  [AI] 파싱 실패 (${article.title}) — 응답: ${text.slice(0, 200)}`,
      );
      return this.fallback(article);
    } catch (error) {
      console.error(
        `  [AI] 요약 실패 (${article.title}):`,
        error instanceof Error ? error.message : error,
      );
      return this.fallback(article);
    }
  }

  /**
   * 429 rate limit 에러 시 대기 후 재시도한다. 최대 3회.
   */
  private async requestWithRetry(
    prompt: string,
    maxRetries = 3,
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.client.chat.completions.create({
          model: this.modelName,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          max_tokens: 512,
        });
      } catch (error: unknown) {
        const status = (error as { status?: number }).status;
        if (status === 429 && attempt < maxRetries) {
          const msg = error instanceof Error ? error.message : "";
          const waitMatch = msg.match(/(\d+\.?\d*)\s*s/);
          const waitSec = waitMatch
            ? Math.ceil(parseFloat(waitMatch[1])) + 3
            : 15;
          console.warn(
            `  [AI] Rate limit — ${waitSec}초 대기 후 재시도 (${attempt}/${maxRetries})`,
          );
          await new Promise((r) => setTimeout(r, waitSec * 1000));
          continue;
        }
        throw error;
      }
    }
    throw new Error("최대 재시도 횟수 초과");
  }

  /**
   * 한글 번역 결과에서 CJK(중국어/일본어), 태국어 등 비한글 문자를 제거한다.
   */
  private sanitizeKorean(text: string): string {
    return text
      .replace(
        /[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uF900-\uFAFF\u0E00-\u0E7F\u0600-\u06FF\u0400-\u04FF]/g,
        "",
      )
      .replace(/\s{2,}/g, " ")
      .trim();
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
    } else {
      // 잘린 JSON 복구: { 로 시작하지만 } 가 없는 경우
      const openBrace = cleaned.indexOf("{");
      if (openBrace >= 0) {
        cleaned = cleaned.slice(openBrace) + '"}';
      }
    }

    const tryParse = (json: string) => {
      const parsed = JSON.parse(json);
      return {
        englishSummary: String(parsed.englishSummary ?? ""),
        summary: this.sanitizeKorean(String(parsed.summary ?? "")),
        translatedTitle: this.sanitizeKorean(
          String(parsed.translatedTitle ?? ""),
        ),
      };
    };

    // 1차: 그대로 파싱
    try {
      return tryParse(cleaned);
    } catch {
      /* fall through */
    }

    // 2차: 이스케이프 안 된 따옴표 수정
    const fixed = cleaned.replace(
      /([{,]\s*"(?:englishSummary|summary|translatedTitle)"\s*:\s*")([\s\S]*?)("(?:\s*[,}]))/g,
      (_match, prefix, value, suffix) => {
        const escaped = value.replace(/(?<!\\)"/g, '\\"');
        return prefix + escaped + suffix;
      },
    );
    try {
      return tryParse(fixed);
    } catch {
      /* fall through */
    }

    // 3차: 정규식으로 개별 필드 추출 (잘린 응답에도 동작)
    const extract = (key: string): string => {
      const re = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`, "s");
      const m = cleaned.match(re);
      return m ? m[1].replace(/\\"/g, '"').replace(/\\n/g, " ") : "";
    };
    return {
      englishSummary: extract("englishSummary"),
      summary: this.sanitizeKorean(extract("summary")),
      translatedTitle: this.sanitizeKorean(extract("translatedTitle")),
    };
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

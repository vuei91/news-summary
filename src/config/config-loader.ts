// 설정 파일 로더/검증
import { readFileSync } from "fs";
import type { DigestConfig, FeedSource } from "../types/index.js";

export interface EnvConfig {
  aiApiKey?: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
}

/**
 * JSON 설정 파일에서 DigestConfig를 로드한다.
 * 파일이 없거나 파싱에 실패하면 에러를 throw한다.
 */
export function loadConfig(path: string): DigestConfig {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    throw new Error(`설정 파일을 찾을 수 없습니다: ${path}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`설정 파일이 유효한 JSON이 아닙니다: ${path}`);
  }

  return validate(parsed);
}

/**
 * 설정 객체의 필수 필드를 검증하고 DigestConfig를 반환한다.
 * 검증 실패 시 구체적 에러 메시지와 함께 에러를 throw한다.
 */
export function validate(config: unknown): DigestConfig {
  const errors: string[] = [];

  if (config === null || typeof config !== "object") {
    throw new Error("설정이 유효한 객체가 아닙니다");
  }

  const cfg = config as Record<string, unknown>;

  // sources 검증
  if (!Array.isArray(cfg.sources)) {
    errors.push("sources 필드가 배열이어야 합니다");
  } else if (cfg.sources.length === 0) {
    errors.push("sources 배열에 최소 1개의 소스가 필요합니다");
  } else {
    cfg.sources.forEach((source: unknown, i: number) => {
      validateSource(source, i, errors);
    });
  }

  // email 검증
  if (cfg.email === null || typeof cfg.email !== "object") {
    errors.push("email 필드가 객체여야 합니다");
  } else {
    const email = cfg.email as Record<string, unknown>;
    if (!email.to || typeof email.to !== "string" || email.to.trim() === "") {
      errors.push("email.to 필드가 필요합니다 (비어있지 않은 문자열)");
    }
  }

  // ai 검증 — provider 제한 없음 (groq, gemini 등)
  if (cfg.ai !== undefined) {
    if (cfg.ai === null || typeof cfg.ai !== "object") {
      errors.push("ai 필드가 객체여야 합니다");
    }
  }

  if (errors.length > 0) {
    throw new Error(`설정 검증 실패:\n- ${errors.join("\n- ")}`);
  }

  // 기본값 적용
  const aiConfig = cfg.ai as Record<string, unknown> | undefined;

  return {
    sources: cfg.sources as FeedSource[],
    email: cfg.email as DigestConfig["email"],
    ai: {
      provider: (aiConfig?.provider as string) ?? "groq",
      model: (aiConfig?.model as string) ?? "llama-3.3-70b-versatile",
      language: (aiConfig?.language as string) ?? "ko",
    },
    ...(cfg.schedule !== undefined ? { schedule: cfg.schedule as string } : {}),
    ...(cfg.maxArticlesPerSource !== undefined ? { maxArticlesPerSource: cfg.maxArticlesPerSource as number } : {}),
  };
}

function validateSource(
  source: unknown,
  index: number,
  errors: string[],
): void {
  if (source === null || typeof source !== "object") {
    errors.push(`sources[${index}]가 객체여야 합니다`);
    return;
  }
  const s = source as Record<string, unknown>;

  if (!s.name || typeof s.name !== "string") {
    errors.push(`sources[${index}].name 필드가 필요합니다 (문자열)`);
  }
  if (!s.feedUrl || typeof s.feedUrl !== "string") {
    errors.push(`sources[${index}].feedUrl 필드가 필요합니다 (문자열)`);
  }
  if (!s.category || typeof s.category !== "string") {
    errors.push(`sources[${index}].category 필드가 필요합니다 (문자열)`);
  }
}

/**
 * 환경변수에서 민감 정보를 로드한다.
 * 필수 환경변수가 없으면 에러를 throw한다.
 */
export function loadEnvConfig(): EnvConfig {
  const errors: string[] = [];

  const geminiApiKey = process.env.OPENAI_API_KEY ?? process.env.GEMINI_API_KEY ?? process.env.GROQ_API_KEY ?? process.env.AI_API_KEY;
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  // AI API 키는 Ollama(로컬) 사용 시 불필요하므로 선택적으로 검증
  if (!smtpHost) errors.push("SMTP_HOST 환경변수가 설정되지 않았습니다");
  if (!smtpPort) errors.push("SMTP_PORT 환경변수가 설정되지 않았습니다");
  if (!smtpUser) errors.push("SMTP_USER 환경변수가 설정되지 않았습니다");
  if (!smtpPass) errors.push("SMTP_PASS 환경변수가 설정되지 않았습니다");

  if (errors.length > 0) {
    throw new Error(`환경변수 검증 실패:\n- ${errors.join("\n- ")}`);
  }

  const port = parseInt(smtpPort!, 10);
  if (isNaN(port)) {
    throw new Error("SMTP_PORT 환경변수가 유효한 숫자가 아닙니다");
  }

  return {
    aiApiKey: geminiApiKey,
    smtpHost: smtpHost!,
    smtpPort: port,
    smtpUser: smtpUser!,
    smtpPass: smtpPass!,
  };
}

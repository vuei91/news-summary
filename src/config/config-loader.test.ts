import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFileSync, unlinkSync } from "fs";
import { loadConfig, validate, loadEnvConfig } from "./config-loader.js";

const VALID_CONFIG = {
  sources: [
    { name: "Test Source", feedUrl: "https://example.com/rss", category: "tech" },
  ],
  email: { to: "user@example.com" },
  ai: { provider: "gemini", language: "ko" },
};

const TMP_PATH = "test-config-tmp.json";

describe("loadConfig", () => {
  afterEach(() => {
    try { unlinkSync(TMP_PATH); } catch { /* ignore */ }
  });

  it("유효한 JSON 파일에서 DigestConfig를 로드한다", () => {
    writeFileSync(TMP_PATH, JSON.stringify(VALID_CONFIG));
    const result = loadConfig(TMP_PATH);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].name).toBe("Test Source");
    expect(result.email.to).toBe("user@example.com");
    expect(result.ai.provider).toBe("gemini");
  });

  it("파일이 없으면 에러를 throw한다", () => {
    expect(() => loadConfig("nonexistent.json")).toThrow("설정 파일을 찾을 수 없습니다");
  });

  it("유효하지 않은 JSON이면 에러를 throw한다", () => {
    writeFileSync(TMP_PATH, "not json {{{");
    expect(() => loadConfig(TMP_PATH)).toThrow("유효한 JSON이 아닙니다");
  });

  it("ai 기본값을 적용한다 (model, language)", () => {
    const config = { ...VALID_CONFIG, ai: { provider: "gemini" } };
    writeFileSync(TMP_PATH, JSON.stringify(config));
    const result = loadConfig(TMP_PATH);
    expect(result.ai.model).toBe("gemini-2.0-flash");
    expect(result.ai.language).toBe("ko");
  });
});

describe("validate", () => {
  it("유효한 설정을 통과시킨다", () => {
    const result = validate(VALID_CONFIG);
    expect(result.sources).toHaveLength(1);
    expect(result.email.to).toBe("user@example.com");
  });

  it("null 입력에 에러를 throw한다", () => {
    expect(() => validate(null)).toThrow("유효한 객체가 아닙니다");
  });

  it("sources가 빈 배열이면 에러를 throw한다", () => {
    expect(() => validate({ ...VALID_CONFIG, sources: [] })).toThrow("최소 1개의 소스가 필요합니다");
  });

  it("sources가 배열이 아니면 에러를 throw한다", () => {
    expect(() => validate({ ...VALID_CONFIG, sources: "not array" })).toThrow("sources 필드가 배열이어야 합니다");
  });

  it("소스에 name이 없으면 에러를 throw한다", () => {
    const config = { ...VALID_CONFIG, sources: [{ feedUrl: "url", category: "tech" }] };
    expect(() => validate(config)).toThrow("sources[0].name 필드가 필요합니다");
  });

  it("소스에 feedUrl이 없으면 에러를 throw한다", () => {
    const config = { ...VALID_CONFIG, sources: [{ name: "Test", category: "tech" }] };
    expect(() => validate(config)).toThrow("sources[0].feedUrl 필드가 필요합니다");
  });

  it("소스에 category가 없으면 에러를 throw한다", () => {
    const config = { ...VALID_CONFIG, sources: [{ name: "Test", feedUrl: "url" }] };
    expect(() => validate(config)).toThrow("sources[0].category 필드가 필요합니다");
  });

  it("email 필드가 없으면 에러를 throw한다", () => {
    expect(() => validate({ sources: VALID_CONFIG.sources })).toThrow("email 필드가 객체여야 합니다");
  });

  it("email.to가 없으면 에러를 throw한다", () => {
    const config = { ...VALID_CONFIG, email: { from: "sender" } };
    expect(() => validate(config)).toThrow("email.to 필드가 필요합니다");
  });

  it("email.to가 빈 문자열이면 에러를 throw한다", () => {
    const config = { ...VALID_CONFIG, email: { to: "  " } };
    expect(() => validate(config)).toThrow("email.to 필드가 필요합니다");
  });

  it("여러 에러를 한번에 보고한다", () => {
    try {
      validate({ sources: [], email: {} });
      expect.fail("에러가 throw되어야 합니다");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("최소 1개의 소스가 필요합니다");
      expect(msg).toContain("email.to 필드가 필요합니다");
    }
  });

  it("schedule 필드가 있으면 포함한다", () => {
    const config = { ...VALID_CONFIG, schedule: "0 9 * * *" };
    const result = validate(config);
    expect(result.schedule).toBe("0 9 * * *");
  });
});

describe("loadEnvConfig", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("SMTP_HOST", "smtp.gmail.com");
    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_USER", "user@gmail.com");
    vi.stubEnv("SMTP_PASS", "app-password");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("모든 환경변수가 있으면 EnvConfig를 반환한다", () => {
    const result = loadEnvConfig();
    expect(result.geminiApiKey).toBe("test-key");
    expect(result.smtpHost).toBe("smtp.gmail.com");
    expect(result.smtpPort).toBe(587);
    expect(result.smtpUser).toBe("user@gmail.com");
    expect(result.smtpPass).toBe("app-password");
  });

  it("GEMINI_API_KEY가 없으면 에러를 throw한다", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(() => loadEnvConfig()).toThrow("GEMINI_API_KEY");
  });

  it("SMTP_PORT가 숫자가 아니면 에러를 throw한다", () => {
    vi.stubEnv("SMTP_PORT", "not-a-number");
    expect(() => loadEnvConfig()).toThrow("유효한 숫자가 아닙니다");
  });

  it("여러 환경변수가 없으면 모든 에러를 보고한다", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("SMTP_HOST", "");
    try {
      loadEnvConfig();
      expect.fail("에러가 throw되어야 합니다");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("GEMINI_API_KEY");
      expect(msg).toContain("SMTP_HOST");
    }
  });
});

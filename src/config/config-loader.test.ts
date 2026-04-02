import { describe, it, expect, afterEach, vi } from "vitest";
import { writeFileSync, unlinkSync } from "fs";
import { loadConfig, validate, loadEnvConfig } from "./config-loader.js";

const VALID_CONFIG = {
  sources: [
    { name: "Test Source", feedUrl: "https://example.com/rss", category: "tech" },
  ],
  ai: { provider: "groq", language: "ko" },
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
    expect(result.ai.provider).toBe("groq");
  });

  it("파일이 없으면 에러를 throw한다", () => {
    expect(() => loadConfig("nonexistent.json")).toThrow("설정 파일을 찾을 수 없습니다");
  });

  it("유효하지 않은 JSON이면 에러를 throw한다", () => {
    writeFileSync(TMP_PATH, "not json {{{");
    expect(() => loadConfig(TMP_PATH)).toThrow("유효한 JSON이 아닙니다");
  });

  it("ai 기본값을 적용한다 (model, language)", () => {
    const config = { ...VALID_CONFIG, ai: { provider: "groq" } };
    writeFileSync(TMP_PATH, JSON.stringify(config));
    const result = loadConfig(TMP_PATH);
    expect(result.ai.model).toBe("llama-3.3-70b-versatile");
    expect(result.ai.language).toBe("ko");
  });
});

describe("validate", () => {
  it("유효한 설정을 통과시킨다", () => {
    const result = validate(VALID_CONFIG);
    expect(result.sources).toHaveLength(1);
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

  it("schedule 필드가 있으면 포함한다", () => {
    const config = { ...VALID_CONFIG, schedule: "0 9 * * *" };
    const result = validate(config);
    expect(result.schedule).toBe("0 9 * * *");
  });

  it("maxArticlesPerSource 필드가 있으면 포함한다", () => {
    const config = { ...VALID_CONFIG, maxArticlesPerSource: 5 };
    const result = validate(config);
    expect(result.maxArticlesPerSource).toBe(5);
  });
});

describe("loadEnvConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("GROQ_API_KEY가 있으면 aiApiKey를 반환한다", () => {
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    const result = loadEnvConfig();
    expect(result.aiApiKey).toBe("gsk_test");
  });

  it("DISCORD_WEBHOOK_URL이 있으면 반환한다", () => {
    vi.stubEnv("DISCORD_WEBHOOK_URL", "https://discord.com/api/webhooks/test");
    const result = loadEnvConfig();
    expect(result.discordWebhookUrl).toBe("https://discord.com/api/webhooks/test");
  });

  it("환경변수가 없어도 에러 없이 반환한다", () => {
    const result = loadEnvConfig();
    expect(result).toBeDefined();
  });
});

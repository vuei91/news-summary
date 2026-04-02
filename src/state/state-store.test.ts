import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { StateStore } from "./state-store.js";

const TMP_PATH = "test-state-tmp.json";

function cleanup() {
  try {
    if (existsSync(TMP_PATH)) unlinkSync(TMP_PATH);
  } catch { /* ignore */ }
}

describe("StateStore", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  describe("load", () => {
    it("파일이 없으면 빈 상태를 반환한다", () => {
      const store = new StateStore(TMP_PATH);
      const state = store.getState();
      expect(state.processedArticles).toEqual([]);
      expect(state.lastRunAt).toBeUndefined();
    });

    it("유효한 상태 파일을 로드한다", () => {
      const data = {
        processedArticles: [
          { url: "https://example.com/1", processedAt: "2024-01-15T09:00:00Z" },
        ],
        lastRunAt: "2024-01-15T09:00:00Z",
      };
      writeFileSync(TMP_PATH, JSON.stringify(data));

      const store = new StateStore(TMP_PATH);
      const state = store.getState();
      expect(state.processedArticles).toHaveLength(1);
      expect(state.processedArticles[0].url).toBe("https://example.com/1");
      expect(state.lastRunAt).toBe("2024-01-15T09:00:00Z");
    });

    it("손상된 JSON이면 빈 상태로 초기화하고 경고를 출력한다", () => {
      writeFileSync(TMP_PATH, "not valid json {{{");
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const store = new StateStore(TMP_PATH);
      const state = store.getState();
      expect(state.processedArticles).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("상태 파일을 파싱할 수 없습니다"),
      );

      warnSpy.mockRestore();
    });

    it("processedArticles가 배열이 아니면 빈 상태로 초기화한다", () => {
      writeFileSync(TMP_PATH, JSON.stringify({ processedArticles: "not array" }));
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const store = new StateStore(TMP_PATH);
      expect(store.getState().processedArticles).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe("save", () => {
    it("상태를 JSON 파일로 저장한다", () => {
      const store = new StateStore(TMP_PATH);
      const data = {
        processedArticles: [
          { url: "https://example.com/a", processedAt: "2024-06-01T00:00:00Z" },
        ],
        lastRunAt: "2024-06-01T00:00:00Z",
      };
      store.save(data);

      const loaded = JSON.parse(
        require("fs").readFileSync(TMP_PATH, "utf-8"),
      );
      expect(loaded.processedArticles).toHaveLength(1);
      expect(loaded.processedArticles[0].url).toBe("https://example.com/a");
    });

    it("save 후 getState가 저장된 상태를 반환한다", () => {
      const store = new StateStore(TMP_PATH);
      const data = {
        processedArticles: [
          { url: "https://example.com/b", processedAt: "2024-06-01T00:00:00Z" },
        ],
      };
      store.save(data);
      expect(store.getState().processedArticles[0].url).toBe("https://example.com/b");
    });
  });

  describe("isProcessed", () => {
    it("처리된 URL에 대해 true를 반환한다", () => {
      const data = {
        processedArticles: [
          { url: "https://example.com/1", processedAt: "2024-01-01T00:00:00Z" },
        ],
      };
      writeFileSync(TMP_PATH, JSON.stringify(data));

      const store = new StateStore(TMP_PATH);
      expect(store.isProcessed("https://example.com/1")).toBe(true);
    });

    it("처리되지 않은 URL에 대해 false를 반환한다", () => {
      const store = new StateStore(TMP_PATH);
      expect(store.isProcessed("https://example.com/unknown")).toBe(false);
    });
  });

  describe("addProcessed", () => {
    it("URL 목록을 추가하고 isProcessed가 true를 반환한다", () => {
      const store = new StateStore(TMP_PATH);
      store.addProcessed(["https://a.com", "https://b.com"]);

      expect(store.isProcessed("https://a.com")).toBe(true);
      expect(store.isProcessed("https://b.com")).toBe(true);
    });

    it("이미 처리된 URL은 중복 추가하지 않는다", () => {
      const data = {
        processedArticles: [
          { url: "https://a.com", processedAt: "2024-01-01T00:00:00Z" },
        ],
      };
      writeFileSync(TMP_PATH, JSON.stringify(data));

      const store = new StateStore(TMP_PATH);
      store.addProcessed(["https://a.com", "https://b.com"]);

      expect(store.getState().processedArticles).toHaveLength(2);
    });

    it("추가된 항목에 ISO 8601 타임스탬프가 포함된다", () => {
      const store = new StateStore(TMP_PATH);
      store.addProcessed(["https://a.com"]);

      const entry = store.getState().processedArticles[0];
      expect(entry.processedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("빈 배열을 추가해도 에러가 발생하지 않는다", () => {
      const store = new StateStore(TMP_PATH);
      store.addProcessed([]);
      expect(store.getState().processedArticles).toHaveLength(0);
    });
  });

  describe("cleanup", () => {
    it("maxAgeDays보다 오래된 항목을 제거한다", () => {
      const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
      const recent = new Date().toISOString();

      const data = {
        processedArticles: [
          { url: "https://old.com", processedAt: old },
          { url: "https://recent.com", processedAt: recent },
        ],
      };
      writeFileSync(TMP_PATH, JSON.stringify(data));

      const store = new StateStore(TMP_PATH);
      store.cleanup(30);

      expect(store.isProcessed("https://old.com")).toBe(false);
      expect(store.isProcessed("https://recent.com")).toBe(true);
      expect(store.getState().processedArticles).toHaveLength(1);
    });

    it("모든 항목이 오래되면 빈 배열이 된다", () => {
      const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      const data = {
        processedArticles: [
          { url: "https://a.com", processedAt: old },
          { url: "https://b.com", processedAt: old },
        ],
      };
      writeFileSync(TMP_PATH, JSON.stringify(data));

      const store = new StateStore(TMP_PATH);
      store.cleanup(30);

      expect(store.getState().processedArticles).toHaveLength(0);
    });

    it("모든 항목이 최신이면 아무것도 제거하지 않는다", () => {
      const recent = new Date().toISOString();
      const data = {
        processedArticles: [
          { url: "https://a.com", processedAt: recent },
          { url: "https://b.com", processedAt: recent },
        ],
      };
      writeFileSync(TMP_PATH, JSON.stringify(data));

      const store = new StateStore(TMP_PATH);
      store.cleanup(30);

      expect(store.getState().processedArticles).toHaveLength(2);
    });
  });
});

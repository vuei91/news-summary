// 상태 저장소 — 중복 방지

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { StateData } from "../types/index.js";

export class StateStore {
  private state: StateData;
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.state = this.load();
  }

  load(): StateData {
    if (!existsSync(this.filePath)) {
      return { processedArticles: [] };
    }

    try {
      const raw = readFileSync(this.filePath, "utf-8");
      const parsed = JSON.parse(raw);

      if (
        !parsed ||
        typeof parsed !== "object" ||
        !Array.isArray(parsed.processedArticles)
      ) {
        console.warn(`[StateStore] 상태 파일이 손상되었습니다. 빈 상태로 초기화합니다: ${this.filePath}`);
        return { processedArticles: [] };
      }

      return parsed as StateData;
    } catch {
      console.warn(`[StateStore] 상태 파일을 파싱할 수 없습니다. 빈 상태로 초기화합니다: ${this.filePath}`);
      return { processedArticles: [] };
    }
  }

  save(state: StateData): void {
    this.state = state;
    writeFileSync(this.filePath, JSON.stringify(state, null, 2), "utf-8");
  }

  isProcessed(url: string): boolean {
    return this.state.processedArticles.some((entry) => entry.url === url);
  }

  addProcessed(urls: string[]): void {
    const now = new Date().toISOString();
    for (const url of urls) {
      if (!this.isProcessed(url)) {
        this.state.processedArticles.push({ url, processedAt: now });
      }
    }
  }

  cleanup(maxAgeDays: number): void {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    this.state.processedArticles = this.state.processedArticles.filter(
      (entry) => new Date(entry.processedAt).getTime() >= cutoff,
    );
  }

  getState(): StateData {
    return this.state;
  }
}

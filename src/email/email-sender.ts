// 이메일 발송 모듈

import { createTransport, type Transporter } from "nodemailer";
import type { Digest, SendResult, SummarizedArticle } from "../types/index.js";

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromName?: string;
}

const BASE_DELAY_MS = 1000;
const MAX_ATTEMPTS = 3;

function isAuthError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("invalid login") || msg.includes("authentication")) return true;
    // Nodemailer uses responseCode for SMTP errors
    const code = (err as Record<string, unknown>).responseCode;
    if (code === 535 || code === 534) return true;
  }
  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatSubjectDate(date: Date): string {
  return new Date(date).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export class EmailSender {
  private transporter: Transporter;
  private fromAddress: string;

  constructor(config: SmtpConfig) {
    this.transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass },
    });
    const name = config.fromName ?? "News Digest";
    this.fromAddress = `"${name}" <${config.user}>`;
  }

  async send(digest: Digest, recipient: string): Promise<SendResult> {
    const html = buildHtml(digest);
    const subject = `📰 뉴스 다이제스트 — ${formatSubjectDate(digest.generatedAt)}`;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const info = await this.transporter.sendMail({
          from: this.fromAddress,
          to: recipient,
          subject,
          html,
        });
        return { success: true, messageId: info.messageId, attempts: attempt };
      } catch (err) {
        // Auth failures should not retry
        if (isAuthError(err)) {
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
            attempts: attempt,
          };
        }

        if (attempt < MAX_ATTEMPTS) {
          const waitMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          await delay(waitMs);
          continue;
        }

        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
          attempts: attempt,
        };
      }
    }

    // Unreachable, but satisfies TypeScript
    return { success: false, error: "Unexpected error", attempts: MAX_ATTEMPTS };
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  general: "📰 일반",
  world: "🌍 세계",
  politics: "🏛️ 정치",
  tech: "💻 기술",
  economy: "💰 경제",
  sports: "⚽ 스포츠",
  culture: "🎭 문화",
};

function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? `📌 ${category}`;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function groupBySource(
  articles: SummarizedArticle[]
): Map<string, SummarizedArticle[]> {
  const groups = new Map<string, SummarizedArticle[]>();
  for (const article of articles) {
    const src = article.source;
    if (!groups.has(src)) groups.set(src, []);
    groups.get(src)!.push(article);
  }
  return groups;
}

function groupByCategory(
  articles: SummarizedArticle[]
): Map<string, SummarizedArticle[]> {
  const groups = new Map<string, SummarizedArticle[]>();
  for (const article of articles) {
    const cat = article.category;
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(article);
  }
  return groups;
}

function buildStatsHtml(digest: Digest): string {
  const { stats } = digest;
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:#f0f4f8;border-radius:8px;padding:16px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-size:14px;color:#475569;padding-bottom:8px;font-weight:600;">📊 다이제스트 통계</td>
            </tr>
            <tr>
              <td>
                <table cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="font-size:13px;color:#64748b;padding-right:20px;">수집: <strong style="color:#1e293b;">${stats.totalCollected}</strong>건</td>
                    <td style="font-size:13px;color:#64748b;padding-right:20px;">신규: <strong style="color:#1e293b;">${stats.totalNew}</strong>건</td>
                    <td style="font-size:13px;color:#16a34a;padding-right:20px;">요약 성공: <strong>${stats.summarizeSuccess}</strong></td>
                    <td style="font-size:13px;color:#d97706;padding-right:20px;">폴백: <strong>${stats.summarizeFallback}</strong></td>
                    <td style="font-size:13px;color:#dc2626;">실패: <strong>${stats.summarizeFailed}</strong></td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

function buildArticleHtml(article: SummarizedArticle): string {
  const fallbackBadge = article.isFallback
    ? `<span style="display:inline-block;background:#fef3c7;color:#92400e;font-size:11px;padding:2px 6px;border-radius:4px;margin-left:8px;">폴백</span>`
    : "";

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
      <tr>
        <td style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-size:16px;font-weight:600;color:#1e293b;padding-bottom:8px;line-height:1.4;">
                ${escapeHtml(article.translatedTitle)}${fallbackBadge}
              </td>
            </tr>
            <tr>
              <td style="font-size:14px;color:#475569;line-height:1.6;padding-bottom:8px;">
                ${escapeHtml(article.summary)}
              </td>
            </tr>
            <tr>
              <td style="font-size:12px;color:#94a3b8;line-height:1.5;padding-bottom:12px;border-top:1px solid #f1f5f9;padding-top:8px;">
                <em>${escapeHtml(article.englishSummary)}</em>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:8px;">
                <a href="${escapeHtml(article.url)}" style="font-size:13px;color:#3b82f6;text-decoration:none;" target="_blank">
                  ${escapeHtml(article.title)} →
                </a>
              </td>
            </tr>
            <tr>
              <td style="font-size:12px;color:#94a3b8;">
                ${escapeHtml(article.source)} · ${formatDate(article.publishedAt)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

function buildSourceSection(
  source: string,
  articles: SummarizedArticle[]
): string {
  const categoryLabel = getCategoryLabel(articles[0]?.category ?? "general");
  const articleCards = articles.map(buildArticleHtml).join("");
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr>
        <td style="font-size:18px;font-weight:700;color:#1e293b;padding-bottom:12px;border-bottom:2px solid #e2e8f0;">
          📰 ${escapeHtml(source)}
          <span style="font-size:13px;font-weight:400;color:#94a3b8;margin-left:8px;">${categoryLabel} · ${articles.length}건</span>
        </td>
      </tr>
      <tr>
        <td style="padding-top:12px;">
          ${articleCards}
        </td>
      </tr>
    </table>`;
}

function buildCategorySection(
  category: string,
  articles: SummarizedArticle[]
): string {
  const articleCards = articles.map(buildArticleHtml).join("");
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr>
        <td style="font-size:18px;font-weight:700;color:#1e293b;padding-bottom:12px;border-bottom:2px solid #e2e8f0;">
          ${getCategoryLabel(category)}
          <span style="font-size:13px;font-weight:400;color:#94a3b8;margin-left:8px;">${articles.length}건</span>
        </td>
      </tr>
      <tr>
        <td style="padding-top:12px;">
          ${articleCards}
        </td>
      </tr>
    </table>`;
}

export function buildHtml(digest: Digest): string {
  const grouped = groupBySource(digest.articles);
  const sourceSections = Array.from(grouped.entries())
    .map(([source, articles]) => buildSourceSection(source, articles))
    .join("");

  const generatedAt = formatDate(digest.generatedAt);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>뉴스 다이제스트</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:#1e293b;border-radius:8px 8px 0 0;padding:24px 20px;text-align:center;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-size:22px;font-weight:700;color:#ffffff;">📰 뉴스 다이제스트</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#94a3b8;padding-top:6px;">${generatedAt} 생성</td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background:#f8fafc;padding:24px 20px;">
              ${buildStatsHtml(digest)}
              ${sourceSections}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f1f5f9;border-radius:0 0 8px 8px;padding:16px 20px;text-align:center;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-size:12px;color:#94a3b8;">
                    이 이메일은 뉴스 다이제스트 서비스에서 자동 생성되었습니다.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

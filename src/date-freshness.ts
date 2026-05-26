import { extractVisibleText } from "./html.js";
import type { Finding, PageCheck, PageDateSignal } from "./types.js";

const ruMonths: Record<string, number> = {
  января: 1,
  январь: 1,
  февраля: 2,
  февраль: 2,
  марта: 3,
  март: 3,
  апреля: 4,
  апрель: 4,
  мая: 5,
  май: 5,
  июня: 6,
  июнь: 6,
  июля: 7,
  июль: 7,
  августа: 8,
  август: 8,
  сентября: 9,
  сентябрь: 9,
  октября: 10,
  октябрь: 10,
  ноября: 11,
  ноябрь: 11,
  декабря: 12,
  декабрь: 12
};

const enMonths: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12
};

interface DateCandidate {
  raw: string;
  index: number;
  day: number;
  month: number;
  year?: number;
  confidence: PageDateSignal["confidence"];
}

export function extractPageDateSignals(html: string, now: Date): PageDateSignal[] {
  const text = extractVisibleText(html);
  if (!text) return [];

  const candidates = dedupeCandidates([
    ...findRussianDayMonthDates(text),
    ...findEnglishMonthDayDates(text),
    ...findEnglishDayMonthDates(text),
    ...findNumericDates(text),
    ...findIsoDates(text)
  ]);

  return candidates
    .map((candidate) => {
      const assumedYear = candidate.year === undefined;
      const year = candidate.year ?? now.getUTCFullYear();
      const normalized = normalizeDate(year, candidate.month, candidate.day);
      const context = contextAround(text, candidate.index, candidate.raw.length);
      return {
        raw: candidate.raw,
        normalizedDate: normalized?.toISOString().slice(0, 10),
        assumedYear,
        status: normalized ? statusForDate(normalized, now) : "unknown",
        category: categoryForContext(context),
        confidence: candidate.confidence,
        context
      } satisfies PageDateSignal;
    })
    .sort((a, b) => `${a.normalizedDate ?? "9999"}:${a.raw}`.localeCompare(`${b.normalizedDate ?? "9999"}:${b.raw}`));
}

export function dateFreshnessFindings(checks: PageCheck[], now: Date, startIndex: number): Finding[] {
  const findings: Finding[] = [];
  let index = startIndex;

  for (const check of checks) {
    if (!check.ok || !check.contentType.includes("text/html")) continue;
    const staleSignals = check.dateSignals.filter((signal) => isActionablePastDate(signal));
    if (staleSignals.length === 0) continue;

    const mostSevere = staleSignals.some((signal) => ["start", "deadline", "application", "event"].includes(signal.category))
      ? "high"
      : "medium";
    const topSignals = staleSignals.slice(0, 5);

    findings.push({
      id: `finding_${String(index++).padStart(3, "0")}`,
      siteId: check.siteId,
      url: check.url,
      checkType: "date-freshness",
      severity: mostSevere,
      status: "failed",
      title: "Page contains stale agenda date",
      description: "The page contains visible date language that looks like an active lab/event/application date but is already past.",
      expected: "Pages should update past starts, deadlines, application windows, and event CTAs to current state or next cohort.",
      actual: topSignals
        .map((signal) => `${signal.raw} -> ${signal.normalizedDate ?? "unknown"} (${signal.category})`)
        .join("; "),
      remediation: {
        owner: "content",
        summary: "Update stale date copy and CTA state so users and agents do not treat old starts or deadlines as current.",
        steps: [
          "Open the page and find the stale date in the context shown below.",
          "If the cohort/event is still active, change copy and CTA state to in-progress, waitlist, recap, or next cohort.",
          "If the page is intentionally archival, mark it clearly as archive/recap so the checker can classify it as non-blocking."
        ]
      },
      evidence: {
        staleSignals: topSignals,
        allDateSignals: check.dateSignals,
        runDate: now.toISOString()
      }
    });
  }

  return findings;
}

function isActionablePastDate(signal: PageDateSignal): boolean {
  if (signal.status !== "past") return false;
  if (signal.category === "archive" || signal.category === "generic") return false;
  if (signal.confidence === "low") return false;
  return true;
}

function findRussianDayMonthDates(text: string): DateCandidate[] {
  const results: DateCandidate[] = [];
  const pattern = /\b([0-3]?\d)\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+(20\d{2}))?\b/giu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const day = Number.parseInt(match[1], 10);
    const month = ruMonths[match[2].toLowerCase()];
    const year = match[3] ? Number.parseInt(match[3], 10) : undefined;
    if (validDayMonth(day, month)) {
      results.push({ raw: match[0], index: match.index, day, month, year, confidence: year ? "high" : "medium" });
    }
  }
  return results;
}

function findEnglishMonthDayDates(text: string): DateCandidate[] {
  const results: DateCandidate[] = [];
  const pattern = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+([0-3]?\d)(?:,?\s+(20\d{2}))?\b/giu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const month = enMonths[match[1].replace(/\.$/, "").toLowerCase()];
    const day = Number.parseInt(match[2], 10);
    const year = match[3] ? Number.parseInt(match[3], 10) : undefined;
    if (validDayMonth(day, month)) {
      results.push({ raw: match[0], index: match.index, day, month, year, confidence: year ? "high" : "medium" });
    }
  }
  return results;
}

function findEnglishDayMonthDates(text: string): DateCandidate[] {
  const results: DateCandidate[] = [];
  const pattern = /\b([0-3]?\d)\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:\.|,)?(?:\s+(20\d{2}))?\b/giu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const day = Number.parseInt(match[1], 10);
    const month = enMonths[match[2].replace(/\.$/, "").toLowerCase()];
    const year = match[3] ? Number.parseInt(match[3], 10) : undefined;
    if (validDayMonth(day, month)) {
      results.push({ raw: match[0], index: match.index, day, month, year, confidence: year ? "high" : "medium" });
    }
  }
  return results;
}

function findNumericDates(text: string): DateCandidate[] {
  const results: DateCandidate[] = [];
  const pattern = /\b([0-3]?\d)[./-]([01]?\d)[./-](20\d{2}|\d{2})\b/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const day = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const yearRaw = Number.parseInt(match[3], 10);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    if (validDayMonth(day, month)) {
      results.push({ raw: match[0], index: match.index, day, month, year, confidence: "high" });
    }
  }
  return results;
}

function findIsoDates(text: string): DateCandidate[] {
  const results: DateCandidate[] = [];
  const pattern = /\b(20\d{2})-([01]?\d)-([0-3]?\d)\b/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const day = Number.parseInt(match[3], 10);
    if (validDayMonth(day, month)) {
      results.push({ raw: match[0], index: match.index, day, month, year, confidence: "high" });
    }
  }
  return results;
}

function dedupeCandidates(candidates: DateCandidate[]): DateCandidate[] {
  const seen = new Set<string>();
  const result: DateCandidate[] = [];
  for (const candidate of candidates.sort((a, b) => a.index - b.index || b.raw.length - a.raw.length)) {
    const key = `${candidate.index}:${candidate.raw.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

function contextAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 100);
  const end = Math.min(text.length, index + length + 120);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function categoryForContext(context: string): PageDateSignal["category"] {
  const lower = context.toLowerCase();
  if (/\b(privacy|terms|legal|policy|last updated|updated at)\b|политик|конфиденциаль|оферт|договор|юридическ|регистрационн|последнее обновление|обновлено/i.test(lower)) return "archive";
  if (/\b(archive|archived|recap|recording|past|history)\b|архив|запис[ьи]|прошл|материал/i.test(lower)) return "archive";
  if (/\b(deadline|due|apply by|until|registration closes)\b|дедлайн|до\s+\d|заявк|регистрац|при[её]м/i.test(lower)) return "deadline";
  if (/\b(apply|application|applications|enroll|signup|waitlist)\b|подать заявку|заявк|регистрац/i.test(lower)) return "application";
  if (/\b(start|starts|starting|launch|begins|kickoff)\b|старт|начал|запуск/i.test(lower)) return "start";
  if (/\b(event|meetup|webinar|workshop|session)\b|мероприят|вебинар|встреч/i.test(lower)) return "event";
  if (/\b(cohort|batch|lab|laboratory|sprint|course)\b|когорт|поток|лаборатор|лаб[аеуы]?|спринт|курс/i.test(lower)) return "cohort";
  return "generic";
}

function normalizeDate(year: number, month: number, day: number): Date | undefined {
  if (!validDayMonth(day, month)) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return date;
}

function statusForDate(date: Date, now: Date): PageDateSignal["status"] {
  const dateOnly = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const nowOnly = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (dateOnly < nowOnly) return "past";
  if (dateOnly === nowOnly) return "today";
  return "upcoming";
}

function validDayMonth(day: number, month: number | undefined): month is number {
  return Number.isInteger(day) && typeof month === "number" && Number.isInteger(month) && day >= 1 && day <= 31 && month >= 1 && month <= 12;
}

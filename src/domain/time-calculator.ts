import type { Visit } from "./types";
export const MAX_OBSERVED_GAP_MS = 45_000;
export function elapsed(from: number, to: number): number {
  const gap = to - from;
  return gap >= 0 && gap <= MAX_OBSERVED_GAP_MS ? gap : 0;
}
export function todaySummary(visits: Visit[], now = new Date()) {
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const end = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  ).getTime();
  const today = visits.filter(
    (v) =>
      Date.parse(v.startedAt) < end &&
      Date.parse(v.endedAt ?? now.toISOString()) > start,
  );
  const activeMs = today.reduce((sum, v) => {
    // Every visit is a continuous observed interval; gaps produce a new visit.
    const a = Date.parse(v.startedAt);
    const b = a + v.activeDurationMs;
    return (
      sum + Math.max(0, Math.min(b, end, now.getTime()) - Math.max(a, start))
    );
  }, 0);
  return {
    activeMs,
    visitCount: visits.filter(
      (v) => Date.parse(v.startedAt) >= start && Date.parse(v.startedAt) < end,
    ).length,
    domains: new Set(today.map((v) => v.domain)).size,
  };
}

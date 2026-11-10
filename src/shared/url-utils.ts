import type { Candidate } from "../domain/types";
export function sanitizeUrl(
  raw: string,
  excluded: string[] = [],
): { domain: string; url: string; title: string } | null {
  try {
    const u = new URL(raw);
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
      return null;
    const domain = u.hostname.toLowerCase();
    if (excluded.some((d) => domain === d || domain.endsWith("." + d)))
      return null;
    // Domain-only storage deliberately avoids tokens, personal identifiers and search text in paths/titles.
    return { domain, url: u.origin + "/", title: domain };
  } catch {
    return null;
  }
}
export function candidate(
  tab: chrome.tabs.Tab,
  excluded: string[],
): Candidate | null {
  if (tab.incognito || tab.id === undefined || !tab.url) return null;
  const clean = sanitizeUrl(tab.url, excluded);
  return clean ? { ...clean, tabId: tab.id, windowId: tab.windowId } : null;
}

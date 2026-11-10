export interface Visit {
  id: string;
  sessionId: string;
  tabId: number;
  windowId: number;
  domain: string;
  url: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
  activeDurationMs: number;
  status: "active" | "completed" | "interrupted";
}
export interface BrowsingSession {
  id: string;
  startedAt: string;
  endedAt: string | null;
  totalActiveMs: number;
  visitCount: number;
  status: "active" | "completed";
}
export interface TrackingSettings {
  enabled: boolean;
  idleThresholdSeconds: number;
  sessionTimeoutMinutes: number;
  excludedDomains: string[];
}
export interface Checkpoint {
  id: "tracking";
  visitId: string | null;
  sessionId: string | null;
  lastAt: number;
  lastActivityAt: number;
  periodId: string | null;
}
export interface Candidate {
  tabId: number;
  windowId: number;
  domain: string;
  url: string;
  title: string;
}
export const defaults: TrackingSettings = {
  enabled: false,
  idleThresholdSeconds: 60,
  sessionTimeoutMinutes: 20,
  excludedDomains: [],
};

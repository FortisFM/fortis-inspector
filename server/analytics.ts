import { storage } from "./storage";

const DAY = 86400000;

export type RangeKey = "30" | "90" | "365" | "all";

function rangeStart(range: RangeKey): number {
  if (range === "all") return 0;
  return Date.now() - Number(range) * DAY;
}

// Build an enriched issue list with site, entry, inspection date once.
function enrichedIssues() {
  return storage
    .listIssues()
    .map((issue) => {
      const entry = storage.getEntry(issue.entryId);
      const site = storage.getSite(issue.siteId);
      const inspection = storage.getInspection(issue.inspectionId);
      if (!entry || !site) return null;
      const inspectionDate = inspection?.submittedAt || inspection?.startedAt || Date.now();
      return {
        ...issue,
        site,
        label: entry.label,
        severity: entry.severity || "info",
        inspectionDate,
      };
    })
    .filter(Boolean) as Array<{
    id: number;
    siteId: number;
    status: string;
    resolvedAt: number | null;
    site: { id: number; name: string };
    label: string;
    severity: string;
    inspectionDate: number;
  }>;
}

export function buildAnalytics(range: RangeKey) {
  const start = rangeStart(range);
  const issues = enrichedIssues();
  const inspections = storage.listAllInspections();

  const openIssues = issues.filter((i) => i.status !== "resolved");
  const totalOpen = openIssues.length;
  const urgentOpen = openIssues.filter((i) => i.severity === "urgent").length;

  // Average days to resolve over the last 90 days (regardless of range selector).
  const resolved90 = issues.filter(
    (i) => i.status === "resolved" && i.resolvedAt && i.resolvedAt >= Date.now() - 90 * DAY
  );
  const avgDaysToResolve = resolved90.length
    ? Math.round(
        (resolved90.reduce((sum, i) => sum + Math.max(0, (i.resolvedAt! - i.inspectionDate) / DAY), 0) /
          resolved90.length) *
          10
      ) / 10
    : 0;

  // Inspections completed this calendar month.
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const inspectionsThisMonth = inspections.filter(
    (i) => i.status === "submitted" && (i.submittedAt || 0) >= monthStart.getTime()
  ).length;

  // Top 5 failing checklist items (by label) across all sites, within range.
  const failCounts = new Map<string, number>();
  for (const insp of inspections) {
    if (insp.status !== "submitted") continue;
    if ((insp.submittedAt || 0) < start) continue;
    for (const e of storage.listEntries(insp.id)) {
      if (e.status === "fail" && e.label) {
        failCounts.set(e.label, (failCounts.get(e.label) || 0) + 1);
      }
    }
  }
  const topFailingItems = Array.from(failCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Sites ranked by open urgent issues.
  const siteUrgent = new Map<number, { name: string; count: number }>();
  for (const i of openIssues) {
    if (i.severity !== "urgent") continue;
    const cur = siteUrgent.get(i.siteId) || { name: i.site.name, count: 0 };
    cur.count += 1;
    siteUrgent.set(i.siteId, cur);
  }
  const sitesByUrgent = Array.from(siteUrgent.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Issues resolved over time, last 12 weeks.
  const weeks: { week: string; count: number }[] = [];
  for (let w = 11; w >= 0; w--) {
    const weekEnd = Date.now() - w * 7 * DAY;
    const weekStart = weekEnd - 7 * DAY;
    const count = issues.filter(
      (i) => i.resolvedAt && i.resolvedAt > weekStart && i.resolvedAt <= weekEnd
    ).length;
    const label = new Date(weekEnd).toISOString().slice(5, 10);
    weeks.push({ week: label, count });
  }

  return {
    cards: { totalOpen, urgentOpen, avgDaysToResolve, inspectionsThisMonth },
    topFailingItems,
    sitesByUrgent,
    resolvedOverTime: weeks,
  };
}

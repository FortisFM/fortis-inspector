import * as XLSX from "xlsx";
import { storage } from "./storage";

const DAY = 86400000;
const SEV_LABEL: Record<string, string> = {
  info: "Info",
  minor: "Minor",
  moderate: "Moderate",
  urgent: "Urgent",
};
const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};

function dateStr(ts: number | null | undefined): string {
  if (!ts) return "";
  return new Date(ts).toISOString().slice(0, 10);
}

function issuesRows() {
  return storage
    .listIssues()
    .map((issue) => {
      const entry = storage.getEntry(issue.entryId);
      const site = storage.getSite(issue.siteId);
      const inspection = storage.getInspection(issue.inspectionId);
      if (!entry || !site) return null;
      const photos = storage.listPhotos(entry.id);
      const inspectionDate = inspection?.submittedAt || inspection?.startedAt || Date.now();
      return {
        Site: site.name,
        Address: site.address,
        Item: entry.label,
        Section: entry.section,
        Severity: SEV_LABEL[entry.severity || ""] || "",
        Status: STATUS_LABEL[issue.status] || issue.status,
        "Age (days)": Math.floor((Date.now() - inspectionDate) / DAY),
        Details: entry.note,
        Photos: photos.length,
        Reported: dateStr(inspectionDate),
        Resolved: dateStr(issue.resolvedAt),
      };
    })
    .filter(Boolean) as Record<string, any>[];
}

function sitesRows() {
  return storage.listSites().map((s) => {
    const inspections = storage.listInspections(s.id);
    const issues = storage.listIssuesForSite(s.id);
    const open = issues.filter((i) => i.status !== "resolved");
    return {
      Site: s.name,
      Address: s.address,
      "Client contact": s.clientName,
      "Client email": s.clientEmail,
      "Checklist items": storage.listChecklistItems(s.id).length,
      Inspections: inspections.filter((i) => i.status === "submitted").length,
      "Open issues": open.length,
      "Urgent open": open.filter((i) => {
        const e = storage.getEntry(i.entryId);
        return e?.severity === "urgent";
      }).length,
      "Frequency (days)": s.inspectionFrequencyDays ?? "",
      "Next due": s.nextDueDate || "",
    };
  });
}

function inspectionsRows() {
  const rows: Record<string, any>[] = [];
  for (const s of storage.listSites()) {
    for (const insp of storage.listInspections(s.id)) {
      const entries = storage.listEntries(insp.id);
      rows.push({
        Site: s.name,
        Inspector: insp.inspectorName,
        Status: insp.status,
        Started: dateStr(insp.startedAt),
        Submitted: dateStr(insp.submittedAt),
        Pass: entries.filter((e) => e.status === "pass").length,
        Fail: entries.filter((e) => e.status === "fail").length,
        "N/A": entries.filter((e) => e.status === "na").length,
        Observations: entries.filter((e) => e.isObservation).length,
      });
    }
  }
  return rows;
}

function sheet(rows: Record<string, any>[]) {
  return XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
}

export function csvBuffer(type: "issues" | "sites" | "inspection", inspectionId?: number): string {
  let rows: Record<string, any>[] = [];
  if (type === "issues") rows = issuesRows();
  else if (type === "sites") rows = sitesRows();
  else if (type === "inspection" && inspectionId) rows = inspectionEntryRows(inspectionId);
  return XLSX.utils.sheet_to_csv(sheet(rows));
}

export function inspectionEntryRows(inspectionId: number) {
  const insp = storage.getInspection(inspectionId);
  if (!insp) return [];
  const site = storage.getSite(insp.siteId);
  return storage.listEntries(inspectionId).map((e) => ({
    Site: site?.name || "",
    Section: e.section,
    Item: e.label,
    Type: e.isObservation ? "Observation" : "Checklist",
    Status: e.status,
    Severity: SEV_LABEL[e.severity || ""] || "",
    Note: e.note,
    Photos: storage.listPhotos(e.id).length,
  }));
}

export function xlsxBuffer(type: "issues" | "sites" | "inspection" | "portfolio", inspectionId?: number): Buffer {
  const wb = XLSX.utils.book_new();
  if (type === "issues") {
    XLSX.utils.book_append_sheet(wb, sheet(issuesRows()), "Issues");
  } else if (type === "sites") {
    XLSX.utils.book_append_sheet(wb, sheet(sitesRows()), "Sites");
  } else if (type === "inspection" && inspectionId) {
    XLSX.utils.book_append_sheet(wb, sheet(inspectionEntryRows(inspectionId)), "Inspection");
  } else if (type === "portfolio") {
    XLSX.utils.book_append_sheet(wb, sheet(sitesRows()), "Sites");
    XLSX.utils.book_append_sheet(wb, sheet(inspectionsRows()), "Inspections");
    XLSX.utils.book_append_sheet(wb, sheet(issuesRows()), "Issues");
    const issues = storage.listIssues();
    const open = issues.filter((i) => i.status !== "resolved");
    const summary = [
      { Metric: "Total sites", Value: storage.listSites().length },
      { Metric: "Total open issues", Value: open.length },
      { Metric: "Resolved issues", Value: issues.filter((i) => i.status === "resolved").length },
      {
        Metric: "Submitted inspections",
        Value: storage.listAllInspections().filter((i) => i.status === "submitted").length,
      },
      { Metric: "Generated", Value: new Date().toISOString().slice(0, 10) },
    ];
    XLSX.utils.book_append_sheet(wb, sheet(summary), "Summary");
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

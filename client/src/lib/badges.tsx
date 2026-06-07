import { Badge } from "@/components/ui/badge";

const SEV_CLASS: Record<string, string> = {
  info: "bg-slate-500 text-white border-transparent",
  minor: "bg-amber-500 text-white border-transparent",
  moderate: "bg-orange-600 text-white border-transparent",
  urgent: "bg-red-600 text-white border-transparent",
};
const SEV_LABEL: Record<string, string> = {
  info: "Info",
  minor: "Minor",
  moderate: "Moderate",
  urgent: "Urgent",
};

export function SeverityBadge({ severity }: { severity: string | null | undefined }) {
  if (!severity) return null;
  return (
    <Badge className={SEV_CLASS[severity] || SEV_CLASS.info} data-testid={`badge-severity-${severity}`}>
      {SEV_LABEL[severity] || severity}
    </Badge>
  );
}

const STATUS_CLASS: Record<string, string> = {
  pass: "bg-emerald-600 text-white border-transparent",
  fail: "bg-red-600 text-white border-transparent",
  na: "bg-slate-400 text-white border-transparent",
  observation: "bg-primary text-primary-foreground border-transparent",
};
const STATUS_LABEL: Record<string, string> = {
  pass: "Pass",
  fail: "Fail",
  na: "N/A",
  observation: "Observation",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={STATUS_CLASS[status] || STATUS_CLASS.na}>{STATUS_LABEL[status] || status}</Badge>
  );
}

const ISSUE_STATUS_CLASS: Record<string, string> = {
  open: "bg-red-100 text-red-700 border-red-200",
  in_progress: "bg-amber-100 text-amber-700 border-amber-200",
  resolved: "bg-emerald-100 text-emerald-700 border-emerald-200",
};
const ISSUE_STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
};

export function IssueStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={ISSUE_STATUS_CLASS[status] || ISSUE_STATUS_CLASS.open}>
      {ISSUE_STATUS_LABEL[status] || status}
    </Badge>
  );
}

export const SEVERITY_RANK: Record<string, number> = { info: 0, minor: 1, moderate: 2, urgent: 3 };

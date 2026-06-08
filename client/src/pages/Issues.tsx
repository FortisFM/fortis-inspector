import { useMemo, useState, useEffect } from "react";
import { Link, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { API_BASE, apiRequest, queryClient, downloadFile } from "@/lib/queryClient";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SeverityBadge, IssueStatusBadge, SEVERITY_RANK } from "@/lib/badges";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, ChevronRight, ImageOff, Download, Mail, Loader2 } from "lucide-react";

type IssueRow = {
  id: number;
  siteId: number;
  siteName: string;
  siteAddress?: string | null;
  inspectionId: number;
  label: string;
  section: string;
  note: string;
  recommendedAction?: string;
  severity: string;
  status: string;
  ageDays: number;
  photos: { id: number; filePath: string }[];
};

// Left border colour by severity.
const SEV_BORDER: Record<string, string> = {
  info: "border-l-slate-400",
  minor: "border-l-amber-500",
  moderate: "border-l-orange-600",
  urgent: "border-l-red-600",
};
const SEV_BAR: Record<string, string> = {
  info: "bg-slate-400",
  minor: "bg-amber-500",
  moderate: "bg-orange-600",
  urgent: "bg-red-600",
};
const SEV_ORDER = ["urgent", "moderate", "minor", "info"];
const SEV_NAME: Record<string, string> = { info: "Info", minor: "Minor", moderate: "Moderate", urgent: "Urgent" };

export default function Issues() {
  const { data: issues, isLoading } = useQuery<IssueRow[]>({ queryKey: ["/api/issues"] });
  const [site, setSite] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [status, setStatus] = useState("active");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const { toast } = useToast();

  // Optional inspection filter via ?inspection=N. When present, we restrict
  // the list to issues from that inspection only and surface a clear banner.
  const search = useSearch();
  const inspectionId = useMemo(() => {
    const p = new URLSearchParams(search);
    const v = p.get("inspection");
    return v ? Number(v) : null;
  }, [search]);
  // When we land here with an inspection filter, default the status filter to
  // 'all' so the user sees every issue from that inspection regardless of state.
  useEffect(() => {
    if (inspectionId) setStatus("all");
  }, [inspectionId]);

  const siteOptions = useMemo(() => {
    const map = new Map<number, string>();
    (issues || []).forEach((i) => map.set(i.siteId, i.siteName));
    return Array.from(map.entries());
  }, [issues]);

  const filtered = useMemo(() => {
    return (issues || [])
      .filter((i) => (inspectionId ? i.inspectionId === inspectionId : true))
      .filter((i) => (site === "all" ? true : i.siteId === Number(site)))
      .filter((i) => (severity === "all" ? true : i.severity === severity))
      .filter((i) =>
        status === "all" ? true : status === "active" ? i.status !== "resolved" : i.status === status
      )
      .sort((a, b) => {
        if (a.status === "resolved" && b.status !== "resolved") return 1;
        if (b.status === "resolved" && a.status !== "resolved") return -1;
        return (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0) || b.ageDays - a.ageDays;
      });
  }, [issues, site, severity, status, inspectionId]);

  // Severity proportion bar over the active (non-resolved) issues in view.
  const sevCounts = useMemo(() => {
    const counts: Record<string, number> = { urgent: 0, moderate: 0, minor: 0, info: 0 };
    filtered.filter((i) => i.status !== "resolved").forEach((i) => {
      counts[i.severity] = (counts[i.severity] || 0) + 1;
    });
    return counts;
  }, [filtered]);
  const sevTotal = SEV_ORDER.reduce((s, k) => s + sevCounts[k], 0);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const selectedRows = filtered.filter((i) => selected.has(i.id));
  const selectedSites = new Set(selectedRows.map((i) => i.siteId));
  const mixedSites = selectedSites.size > 1;

  const bulk = useMutation({
    mutationFn: async (action: "resolve" | "in_progress") =>
      (await apiRequest("POST", "/api/issues/bulk", { ids: Array.from(selected), action })).json(),
    onSuccess: (_d, action) => {
      queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      setSelected(new Set());
      toast({ title: action === "resolve" ? "Marked resolved" : "Marked in progress" });
    },
    onError: (e: any) => toast({ title: "Action failed", description: e.message, variant: "destructive" }),
  });

  // Bulk email: only valid when all selected issues share one site.
  function emailContractor() {
    if (mixedSites) {
      toast({ title: "One site at a time", description: "Select issues from a single site to email a contractor." });
      return;
    }
    const first = selectedRows[0];
    const siteName = first?.siteName || "site";
    const siteAddress = first?.siteAddress || "Not on file";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const blocks = selectedRows.map((i, idx) => {
      const photoUrls = (i.photos || [])
        .map((p) => (p?.filePath ? `${origin}/uploads/${p.filePath}` : ""))
        .filter(Boolean);
      return [
        `${idx + 1}. ${i.label}`,
        `   Area: ${i.section || "Not specified"}`,
        `   Severity: ${SEV_NAME[i.severity] || i.severity}`,
        `   Details: ${i.note || "No additional notes recorded."}`,
        `   Recommended action: ${i.recommendedAction || "Attend the site, assess and rectify."}`,
        photoUrls.length ? "   Photos:\n" + photoUrls.map((u) => "     " + u).join("\n") : "   Photos: none attached",
      ].join("\n");
    });
    const subject = `Fortis FM maintenance request: ${siteName} (${selectedRows.length} item${selectedRows.length === 1 ? "" : "s"})`;
    const body =
`Hi,

Fortis FM has identified maintenance items at one of our sites. Full details below so you can attend without needing to come back for more information.

Site: ${siteName}
Address: ${siteAddress}

Items:

${blocks.join("\n\n")}

Approval:
Works under $500 are pre-approved. If the work is anticipated to exceed $500, please provide a quote or estimate before proceeding.

Please confirm availability and any quote required.

Thanks,
Fortis FM
(07) 3472 7579
admin@fortisfm.com.au`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  async function exportIssues(fmt: "xlsx" | "csv") {
    try {
      await downloadFile(`/api/export/issues.${fmt}`, `fortis-fm-issues.${fmt}`);
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    }
  }

  return (
    <>
      <PageHeader
        title="Issues"
        description={inspectionId ? `Showing issues from inspection #${inspectionId}` : "Maintenance items flagged across all sites"}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" data-testid="button-export-issues"><Download className="mr-2 h-4 w-4" /> Export</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportIssues("xlsx")} data-testid="menu-export-issues-xlsx">Excel (.xlsx)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportIssues("csv")} data-testid="menu-export-issues-csv">CSV (.csv)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      {inspectionId && (
        <div className="mb-4 flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm" data-testid="banner-inspection-filter">
          <span>Filtered to inspection #{inspectionId}.</span>
          <Link href="/issues" className="text-primary underline-offset-2 hover:underline">Clear filter</Link>
        </div>
      )}

      {/* Severity proportion bar */}
      {sevTotal > 0 && (
        <div className="mb-4" data-testid="severity-proportion-bar">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full">
            {SEV_ORDER.map((k) =>
              sevCounts[k] > 0 ? (
                <div
                  key={k}
                  className={cn(SEV_BAR[k])}
                  style={{ width: `${(sevCounts[k] / sevTotal) * 100}%` }}
                  title={`${SEV_NAME[k]}: ${sevCounts[k]}`}
                />
              ) : null
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {SEV_ORDER.map((k) =>
              sevCounts[k] > 0 ? (
                <span key={k} className="flex items-center gap-1.5">
                  <span className={cn("h-2.5 w-2.5 rounded-sm", SEV_BAR[k])} /> {SEV_NAME[k]} {sevCounts[k]}
                </span>
              ) : null
            )}
          </div>
        </div>
      )}

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Select value={site} onValueChange={setSite}>
          <SelectTrigger data-testid="select-filter-site"><SelectValue placeholder="Site" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sites</SelectItem>
            {siteOptions.map(([id, name]) => <SelectItem key={id} value={String(id)}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger data-testid="select-filter-severity"><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="moderate">Moderate</SelectItem>
            <SelectItem value="minor">Minor</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger data-testid="select-filter-status"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Open & in progress</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action toolbar */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-md border bg-background/95 p-3 shadow-sm backdrop-blur" data-testid="bulk-toolbar">
          <span className="text-sm font-medium">{selected.size} selected</span>
          {mixedSites && (
            <span className="text-xs text-muted-foreground">Email is available when all selected issues are from one site.</span>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={emailContractor} disabled={mixedSites} data-testid="button-bulk-email">
              <Mail className="mr-1.5 h-4 w-4" /> Email contractor
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulk.mutate("in_progress")} disabled={bulk.isPending} data-testid="button-bulk-in-progress">
              {bulk.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null} Mark in progress
            </Button>
            <Button size="sm" onClick={() => bulk.mutate("resolve")} disabled={bulk.isPending} data-testid="button-bulk-resolve">
              {bulk.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null} Mark resolved
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-16 text-center">
            <CheckCircle2 className="mb-3 h-8 w-8 text-emerald-600" />
            <p className="font-serif text-lg font-semibold">All clear</p>
            <p className="mt-1 text-sm text-muted-foreground">No issues match these filters.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((issue) => {
            const urgentOverdue = issue.severity === "urgent" && issue.ageDays > 7 && issue.status !== "resolved";
            const isSelected = selected.has(issue.id);
            return (
              <Card
                key={issue.id}
                className={cn(
                  "border-l-4 transition-shadow",
                  SEV_BORDER[issue.severity] || SEV_BORDER.info,
                  urgentOverdue && "ring-1 ring-red-500/40",
                  isSelected && "ring-2 ring-primary/40"
                )}
                data-testid={`card-issue-${issue.id}`}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggle(issue.id)}
                    data-testid={`checkbox-issue-${issue.id}`}
                    aria-label="Select issue"
                  />
                  <Link href={`/issues/${issue.id}`} className="flex min-w-0 flex-1 items-center gap-3" data-testid={`link-issue-${issue.id}`}>
                    {issue.photos[0] ? (
                      <img src={`${API_BASE}/uploads/${issue.photos[0].filePath}`} alt="" className="h-16 w-16 flex-shrink-0 rounded-md border object-cover" />
                    ) : (
                      <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                        <ImageOff className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium" data-testid={`text-issue-label-${issue.id}`}>{issue.label}</p>
                        {urgentOverdue && <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-600" />}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{issue.siteName}</p>
                      <p className={cn("mt-1 text-xs", urgentOverdue ? "font-medium text-red-600" : "text-muted-foreground")}>
                        {issue.ageDays === 0 ? "Today" : `${issue.ageDays}d old`}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                      <SeverityBadge severity={issue.severity} />
                      <IssueStatusBadge status={issue.status} />
                    </div>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/queryClient";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SeverityBadge, IssueStatusBadge, SEVERITY_RANK } from "@/lib/badges";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, ChevronRight, ImageOff } from "lucide-react";

type IssueRow = {
  id: number;
  siteId: number;
  siteName: string;
  label: string;
  section: string;
  note: string;
  severity: string;
  status: string;
  ageDays: number;
  photos: { id: number; filePath: string }[];
};

export default function Issues() {
  const { data: issues, isLoading } = useQuery<IssueRow[]>({ queryKey: ["/api/issues"] });
  const [site, setSite] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [status, setStatus] = useState("active");

  const siteOptions = useMemo(() => {
    const map = new Map<number, string>();
    (issues || []).forEach((i) => map.set(i.siteId, i.siteName));
    return Array.from(map.entries());
  }, [issues]);

  const filtered = useMemo(() => {
    return (issues || [])
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
  }, [issues, site, severity, status]);

  return (
    <>
      <PageHeader title="Issues" description="Maintenance items flagged across all sites" />

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
            return (
              <Link key={issue.id} href={`/issues/${issue.id}`} data-testid={`card-issue-${issue.id}`}>
                <Card className={cn("cursor-pointer hover-elevate", urgentOverdue && "border-red-500 ring-1 ring-red-500/40")}>
                  <CardContent className="flex items-center gap-4 p-4">
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
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

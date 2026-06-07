import { Link, useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { API_BASE, downloadFile } from "@/lib/queryClient";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge, SeverityBadge } from "@/lib/badges";
import { ArrowLeft, Download, ExternalLink, Sheet, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import type { Inspection, Site, InspectionEntry, EntryPhoto } from "@shared/schema";

type Detail = {
  inspection: Inspection;
  site: Site;
  entries: (InspectionEntry & { photos: EntryPhoto[] })[];
};

export default function ViewInspection() {
  const params = useParams();
  const id = Number(params.id);
  const [, navigate] = useLocation();
  const { data, isLoading } = useQuery<Detail>({ queryKey: ["/api/inspections", id] });
  const { toast } = useToast();

  async function exportInspection(fmt: "xlsx" | "csv") {
    try {
      await downloadFile(`/api/export/inspections/${id}.${fmt}`, `fortis-fm-inspection.${fmt}`);
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    }
  }

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!data) return <p>Inspection not found.</p>;

  const { inspection, site, entries } = data;
  const checklistEntries = entries.filter((e) => !e.isObservation);
  const observations = entries.filter((e) => e.isObservation);
  const failedCount = checklistEntries.filter((e) => e.status === "fail").length;

  const grouped = checklistEntries.reduce<Record<string, typeof entries>>((acc, e) => {
    const key = e.section || "General";
    (acc[key] = acc[key] || []).push(e as any);
    return acc;
  }, {});

  return (
    <>
      <button onClick={() => navigate(`/sites/${site.id}`)} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" data-testid="link-back-site-from-inspection">
        <ArrowLeft className="h-4 w-4" /> Back to site
      </button>
      <PageHeader
        title="Inspection Report"
        description={`${site.name} · ${format(new Date(inspection.submittedAt || inspection.startedAt), "d MMM yyyy, h:mm a")} · ${inspection.inspectorName}`}
        actions={
          <>
            <a href={`${API_BASE}/api/inspections/${id}/report.html`} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" data-testid="button-view-report-html">
                <ExternalLink className="mr-2 h-4 w-4" /> Web report
              </Button>
            </a>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" data-testid="button-export-inspection"><Sheet className="mr-2 h-4 w-4" /> Export</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportInspection("xlsx")} data-testid="menu-export-inspection-xlsx">Excel (.xlsx)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportInspection("csv")} data-testid="menu-export-inspection-csv">CSV (.csv)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <a href={`${API_BASE}/api/inspections/${id}/pdf`} target="_blank" rel="noopener noreferrer">
              <Button data-testid="button-download-pdf">
                <Download className="mr-2 h-4 w-4" /> Download PDF
              </Button>
            </a>
          </>
        }
      />

      {failedCount > 0 && (
        <Card className="mb-5 border-amber-500/40 bg-amber-50" data-testid="card-review-issues">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-semibold">{failedCount} {failedCount === 1 ? "item" : "items"} need follow up</p>
                <p className="text-sm text-muted-foreground">Review the issues from this inspection and email contractors when you are ready.</p>
              </div>
            </div>
            <Link href={`/issues?inspection=${id}`}>
              <Button data-testid="button-review-issues">Review issues</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {inspection.executiveSummary && (
        <Card className="mb-5 border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">Executive summary</h2>
            <p className="whitespace-pre-wrap text-sm" data-testid="text-exec-summary">{inspection.executiveSummary}</p>
          </CardContent>
        </Card>
      )}

      {(inspection.weather || inspection.generalNotes) && (
        <Card className="mb-5">
          <CardContent className="space-y-2 p-4 text-sm">
            {inspection.weather && (<p><span className="font-medium">Conditions: </span>{inspection.weather}</p>)}
            {inspection.generalNotes && (<p><span className="font-medium">Notes: </span>{inspection.generalNotes}</p>)}
          </CardContent>
        </Card>
      )}

      {Object.entries(grouped).map(([section, items]) => (
        <div key={section} className="mb-6">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{section}</h2>
          <div className="space-y-3">
            {items.map((e) => <EntryView key={e.id} entry={e} />)}
          </div>
        </div>
      ))}

      {observations.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Observations</h2>
          <div className="space-y-3">
            {observations.map((e) => <EntryView key={e.id} entry={e} />)}
          </div>
        </div>
      )}
    </>
  );
}

function EntryView({ entry }: { entry: InspectionEntry & { photos: EntryPhoto[] } }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium">{entry.label || "Observation"}</p>
          <div className="flex flex-shrink-0 gap-2">
            <StatusBadge status={entry.status} />
            <SeverityBadge severity={entry.severity} />
          </div>
        </div>
        {entry.note && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{entry.note}</p>}
        {entry.photos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {entry.photos.map((p) => (
              <a key={p.id} href={`${API_BASE}/uploads/${p.filePath}`} target="_blank" rel="noopener noreferrer">
                <img src={`${API_BASE}/uploads/${p.filePath}`} alt="" className="h-24 w-24 rounded-md border object-cover" />
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

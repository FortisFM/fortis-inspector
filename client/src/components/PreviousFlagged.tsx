import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { SeverityBadge } from "@/lib/badges";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, History, ImageOff } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface PrevItem {
  entryId: number;
  label: string;
  severity: string | null;
  isObservation: boolean;
  firstPhoto: string | null;
  issueId: number | null;
  issueStatus: string | null;
}
interface PrevResponse {
  inspection: { id: number; submittedAt: number | null } | null;
  items: PrevItem[];
}

// Collapsible panel showing items flagged in the previous submitted inspection
// for this site, so the inspector can check what has and has not been resolved.
export function PreviousFlagged({ siteId, beforeId }: { siteId: number; beforeId: number }) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery<PrevResponse>({
    queryKey: ["/api/sites", siteId, "previous-flagged", `before=${beforeId}`],
    queryFn: async () => {
      const { apiRequest } = await import("@/lib/queryClient");
      const res = await apiRequest("GET", `/api/sites/${siteId}/previous-flagged?before=${beforeId}`);
      return res.json();
    },
  });

  if (!data || !data.inspection || data.items.length === 0) return null;

  return (
    <Card className="mb-5 border-muted-foreground/20">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 p-4 text-left"
        data-testid="button-toggle-previous-flagged"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <History className="h-4 w-4 text-muted-foreground" />
          Previous flagged items
          <Badge variant="outline">{data.items.length}</Badge>
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && (
        <CardContent className="space-y-2 pt-0">
          <p className="mb-2 text-xs text-muted-foreground">
            From inspection on{" "}
            {data.inspection.submittedAt
              ? format(new Date(data.inspection.submittedAt), "d MMM yyyy")
              : "a previous visit"}
          </p>
          {data.items.map((item) => {
            const resolved = item.issueStatus === "resolved";
            return (
              <div
                key={item.entryId}
                className="flex items-center gap-3 rounded-md border p-2.5"
                data-testid={`previous-item-${item.entryId}`}
              >
                {item.firstPhoto ? (
                  <img src={`${API_BASE}/uploads/${item.firstPhoto}`} alt="" className="h-12 w-12 flex-shrink-0 rounded border object-cover" />
                ) : (
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded border bg-muted text-muted-foreground">
                    <ImageOff className="h-4 w-4" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.label}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <SeverityBadge severity={item.severity} />
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "flex-shrink-0",
                    resolved
                      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                      : "bg-amber-100 text-amber-700 border-amber-200"
                  )}
                >
                  {resolved ? "Resolved" : "Open"}
                </Badge>
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}

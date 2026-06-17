import { useState } from "react";
import { useLocation, useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, API_BASE } from "@/lib/queryClient";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { SeverityBadge, IssueStatusBadge } from "@/lib/badges";
import { PhotoUploader, UploadedPhoto } from "@/components/PhotoUploader";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Send, CheckCircle2, Clock, ExternalLink } from "lucide-react";
import { format } from "date-fns";

export default function IssueDetail() {
  const params = useParams();
  const id = Number(params.id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/issues", id] });

  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");
  const [followupPhotos, setFollowupPhotos] = useState<UploadedPhoto[]>([]);

  const updateStatus = useMutation({
    mutationFn: async (payload: any) => (await apiRequest("PATCH", `/api/issues/${id}`, payload)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/issues", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
    },
  });

  const createWorkRequest = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/issues/${id}/work-request`, {});
      return res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/issues", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
      toast({
        title: "Work Request created",
        description: result?.reference ? `Reference: ${result.reference}` : "Posted to Fortis FM Hub.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Could not create Work Request",
        description: err?.message || "Hub did not accept the request.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!data || !data.entry) return <p>Issue not found.</p>;

  const { entry, site } = data;
  const urgentOverdue = entry.severity === "urgent" && data.ageDays > 7 && data.status !== "resolved";
  const hubReference: string | undefined = entry.hubWoReference;
  const hubUrl: string | undefined = entry.hubWoUrl;

  return (
    <>
      <Link href="/issues" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" data-testid="link-back-issues">
        <ArrowLeft className="h-4 w-4" /> All issues
      </Link>

      <PageHeader
        title={entry.label || "Observation"}
        description={site?.name}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => createWorkRequest.mutate()}
              disabled={createWorkRequest.isPending || Boolean(hubReference)}
              data-testid="button-create-work-request"
            >
              <Send className="mr-2 h-4 w-4" />
              {hubReference ? "Work Request sent" : createWorkRequest.isPending ? "Sending..." : "Create Work Request"}
            </Button>
            {data.status !== "resolved" && (
              <Button onClick={() => setResolveOpen(true)} data-testid="button-open-resolve">
                <CheckCircle2 className="mr-2 h-4 w-4" /> Mark resolved
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SeverityBadge severity={entry.severity} />
        <IssueStatusBadge status={data.status} />
        <span className={`inline-flex items-center gap-1 text-xs ${urgentOverdue ? "font-medium text-red-600" : "text-muted-foreground"}`}>
          <Clock className="h-3.5 w-3.5" /> {data.ageDays}d old{urgentOverdue && " · overdue"}
        </span>
      </div>

      {hubReference && (
        <Card className="mb-5 border-green-200 bg-green-50">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <CheckCircle2 className="h-5 w-5 text-green-700" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-900">Work Request: {hubReference}</p>
              <p className="text-xs text-green-800">Posted to Fortis FM Hub.</p>
            </div>
            {hubUrl && (
              <a href={hubUrl} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline" data-testid="link-hub-work-request">
                  Open in Hub <ExternalLink className="ml-2 h-3.5 w-3.5" />
                </Button>
              </a>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="mb-5">
        <CardContent className="space-y-3 p-5">
          {site?.address && <Field label="Site address" value={site.address} />}
          {entry.section && <Field label="Section" value={entry.section} />}
          {entry.note && <Field label="Details" value={entry.note} />}
          {entry.recommendedAction && <Field label="Recommended action" value={entry.recommendedAction} />}
          <Field label="Reported" value={format(new Date(data.inspectionDate), "d MMM yyyy")} />
          {data.resolutionNote && <Field label="Resolution" value={data.resolutionNote} />}
        </CardContent>
      </Card>

      {/* Update status quick controls */}
      {data.status !== "resolved" && (
        <div className="mb-5 flex items-center gap-3">
          <Label className="text-sm">Update status:</Label>
          <Select value={data.status} onValueChange={(v) => updateStatus.mutate({ status: v })}>
            <SelectTrigger className="w-44" data-testid="select-issue-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {data.photos?.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Photos</h2>
          <div className="flex flex-wrap gap-2">
            {data.photos.map((p: any) => (
              <a key={p.id} href={`${API_BASE}/uploads/${p.filePath}`} target="_blank" rel="noopener noreferrer">
                <img src={`${API_BASE}/uploads/${p.filePath}`} alt="" className="h-28 w-28 rounded-md border object-cover" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Resolve dialog */}
      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Mark as resolved</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="resnote">Resolution note (optional)</Label>
              <Textarea id="resnote" value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} rows={3} data-testid="input-resolution-note" />
            </div>
            <div className="space-y-1.5">
              <Label>Follow-up photo (optional)</Label>
              <PhotoUploader photos={followupPhotos} onChange={setFollowupPhotos} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(false)}>Cancel</Button>
            <Button
              data-testid="button-confirm-resolve"
              disabled={updateStatus.isPending}
              onClick={() =>
                updateStatus.mutate(
                  { status: "resolved", resolutionNote, photoIds: followupPhotos.map((p) => p.id) },
                  { onSuccess: () => { setResolveOpen(false); toast({ title: "Issue resolved" }); } }
                )
              }
            >
              Mark resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm">{value}</p>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useLocation, useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, API_BASE } from "@/lib/queryClient";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { ArrowLeft, Mail, CheckCircle2, Copy, Clock } from "lucide-react";
import { format } from "date-fns";

export default function IssueDetail() {
  const params = useParams();
  const id = Number(params.id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/issues", id] });

  const [emailOpen, setEmailOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [followupPhotos, setFollowupPhotos] = useState<UploadedPhoto[]>([]);

  useEffect(() => {
    if (!data) return;
    const site = data.site;
    const entry = data.entry;
    setSubject(`Fortis FM Maintenance Required at ${site?.name || ""}`);
    setBody(
`Hi,

Fortis FM has identified a maintenance item requiring attention during a recent site inspection.

Site: ${site?.name || ""}
Address: ${site?.address || "N/A"}
Item: ${entry?.label || ""}
Severity: ${entry?.severity ? entry.severity.charAt(0).toUpperCase() + entry.severity.slice(1) : "N/A"}
Details: ${entry?.note || "See attached photos."}

Photos attached.

Suggested action: Please attend the site to assess and rectify the above item.

Please reply with quote/availability.

Thanks,
Fortis FM
(07) 3472 7579
admin@fortisfm.com.au`
    );
  }, [data]);

  const updateStatus = useMutation({
    mutationFn: async (payload: any) => (await apiRequest("PATCH", `/api/issues/${id}`, payload)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/issues", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
    },
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!data || !data.entry) return <p>Issue not found.</p>;

  const { entry, site } = data;
  const urgentOverdue = entry.severity === "urgent" && data.ageDays > 7 && data.status !== "resolved";

  function copyEmail() {
    const text = `To: ${to}\nSubject: ${subject}\n\n${body}`;
    navigator.clipboard?.writeText(text).then(
      () => toast({ title: "Copied", description: "Email copied to clipboard." }),
      () => toast({ title: "Copy failed", variant: "destructive" })
    );
  }
  const mailtoHref = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

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
            <Button variant="outline" onClick={() => setEmailOpen(true)} data-testid="button-email-contractor">
              <Mail className="mr-2 h-4 w-4" /> Email contractor
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

      <Card className="mb-5">
        <CardContent className="space-y-3 p-5">
          {site?.address && <Field label="Site address" value={site.address} />}
          {entry.section && <Field label="Section" value={entry.section} />}
          {entry.note && <Field label="Details" value={entry.note} />}
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

      {/* Email dialog */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif">Email contractor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="to">To</Label>
              <Input id="to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="contractor@example.com" data-testid="input-email-to" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="input-email-subject" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="body">Message</Label>
              <Textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} rows={12} className="font-mono text-xs" data-testid="input-email-body" />
            </div>
            <p className="text-xs text-muted-foreground">
              Real email sending (Microsoft 365) is not wired in this MVP. Use the buttons below to send via your mail app or copy the text. See the README for SMTP/Graph setup.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={copyEmail} data-testid="button-copy-email">
              <Copy className="mr-2 h-4 w-4" /> Copy
            </Button>
            <a href={mailtoHref} target="_blank" rel="noopener noreferrer">
              <Button data-testid="button-open-mail">
                <Mail className="mr-2 h-4 w-4" /> Open in mail app
              </Button>
            </a>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

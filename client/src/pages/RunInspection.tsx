import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PhotoUploader, UploadedPhoto } from "@/components/PhotoUploader";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Camera, Plus, Save, Send, Trash2, Loader2, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import type { Site, ChecklistItem, Inspection } from "@shared/schema";

type EntryState = {
  uid: string;
  checklistItemId: number | null;
  label: string;
  section: string;
  requiresPhoto: boolean;
  status: "pass" | "fail" | "na" | "observation";
  note: string;
  severity: string | null;
  isObservation: boolean;
  photos: UploadedPhoto[];
};

const STATUS_OPTS: { value: "pass" | "fail" | "na"; label: string; cls: string }[] = [
  { value: "pass", label: "Pass", cls: "data-[on=true]:bg-emerald-600 data-[on=true]:text-white data-[on=true]:border-emerald-600" },
  { value: "fail", label: "Fail", cls: "data-[on=true]:bg-red-600 data-[on=true]:text-white data-[on=true]:border-red-600" },
  { value: "na", label: "N/A", cls: "data-[on=true]:bg-slate-400 data-[on=true]:text-white data-[on=true]:border-slate-400" },
];

export default function RunInspection() {
  const params = useParams();
  const siteId = Number(params.id);
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const inspectionId = useMemo(() => {
    const h = window.location.hash;
    const q = h.includes("?") ? h.split("?")[1] : "";
    return Number(new URLSearchParams(q).get("id"));
  }, []);

  const { data: site } = useQuery<Site>({ queryKey: ["/api/sites", siteId] });
  const { data: checklist, isLoading } = useQuery<ChecklistItem[]>({ queryKey: ["/api/sites", siteId, "checklist"] });
  const { data: inspection } = useQuery<Inspection>({ queryKey: ["/api/inspections", inspectionId], enabled: !!inspectionId });

  const [entries, setEntries] = useState<EntryState[]>([]);
  const [weather, setWeather] = useState("");
  const [generalNotes, setGeneralNotes] = useState("");
  const [inspectorName, setInspectorName] = useState("");
  const [initialised, setInitialised] = useState(false);

  useEffect(() => {
    if (initialised || !checklist) return;
    setInspectorName(user?.name || "");
    setEntries(
      checklist.map((c) => ({
        uid: `cl-${c.id}`,
        checklistItemId: c.id,
        label: c.label,
        section: c.section,
        requiresPhoto: c.requiresPhoto,
        status: "na",
        note: "",
        severity: null,
        isObservation: false,
        photos: [],
      }))
    );
    setInitialised(true);
  }, [checklist, initialised, user]);

  function updateEntry(uid: string, patch: Partial<EntryState>) {
    setEntries((prev) => prev.map((e) => (e.uid === uid ? { ...e, ...patch } : e)));
  }
  function addObservation() {
    setEntries((prev) => [
      ...prev,
      {
        uid: `obs-${Date.now()}`,
        checklistItemId: null,
        label: "",
        section: "Observation",
        requiresPhoto: false,
        status: "observation",
        note: "",
        severity: "minor",
        isObservation: true,
        photos: [],
      },
    ]);
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), 100);
  }
  function removeEntry(uid: string) {
    setEntries((prev) => prev.filter((e) => e.uid !== uid));
  }

  const save = useMutation({
    mutationFn: async (status: "draft" | "submitted") => {
      const payload = {
        status,
        weather,
        generalNotes,
        inspectorName,
        entries: entries.map((e) => ({
          checklistItemId: e.checklistItemId,
          label: e.label,
          section: e.section,
          status: e.status,
          note: e.note,
          severity: e.status === "fail" || e.isObservation ? e.severity : null,
          isObservation: e.isObservation,
          photoIds: e.photos.map((p) => p.id),
        })),
      };
      return (await apiRequest("POST", `/api/inspections/${inspectionId}/save`, payload)).json();
    },
    onSuccess: (_d, status) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sites", siteId, "inspections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      if (status === "submitted") {
        toast({ title: "Inspection submitted", description: "Report generated." });
        navigate(`/inspections/${inspectionId}`);
      } else {
        toast({ title: "Draft saved" });
      }
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  function validateSubmit(): string | null {
    for (const e of entries) {
      if (!e.isObservation && e.status === "fail" && !e.severity)
        return `Set a severity for failed item "${e.label}".`;
      if (e.requiresPhoto && e.status !== "na" && e.photos.length === 0)
        return `Photo required for "${e.label}".`;
      if (e.isObservation && !e.label.trim())
        return "Give each observation a short title.";
    }
    return null;
  }

  if (isLoading) {
    return <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div>;
  }

  const grouped = entries.reduce<Record<string, EntryState[]>>((acc, e) => {
    const key = e.isObservation ? "__obs" : e.section || "General";
    (acc[key] = acc[key] || []).push(e);
    return acc;
  }, {});
  const sectionKeys = Object.keys(grouped).filter((k) => k !== "__obs");

  return (
    <div className="pb-28">
      <button onClick={() => navigate(`/sites/${siteId}`)} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" data-testid="link-back-site">
        <ArrowLeft className="h-4 w-4" /> Cancel
      </button>

      <div className="mb-5">
        <h1 className="font-serif text-xl font-semibold">{site?.name}</h1>
        <p className="text-sm text-muted-foreground">
          {inspectorName || user?.name} · {format(new Date(inspection?.startedAt || Date.now()), "d MMM yyyy, h:mm a")}
        </p>
      </div>

      {/* Top fields */}
      <Card className="mb-5">
        <CardContent className="space-y-4 p-4">
          <div className="space-y-2">
            <Label htmlFor="inspector">Inspector</Label>
            <Input id="inspector" value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} data-testid="input-inspector-name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="weather">Weather / conditions (optional)</Label>
            <Input id="weather" value={weather} onChange={(e) => setWeather(e.target.value)} placeholder="e.g. Fine, 24°C" data-testid="input-weather" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gnotes">General notes (optional)</Label>
            <Textarea id="gnotes" value={generalNotes} onChange={(e) => setGeneralNotes(e.target.value)} rows={2} data-testid="input-general-notes" />
          </div>
        </CardContent>
      </Card>

      {/* Checklist sections */}
      {sectionKeys.map((section) => (
        <div key={section} className="mb-6">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{section}</h2>
          <div className="space-y-3">
            {grouped[section].map((e) => (
              <EntryCard key={e.uid} entry={e} onUpdate={updateEntry} onRemove={null} />
            ))}
          </div>
        </div>
      ))}

      {/* Observations */}
      {grouped["__obs"]?.length ? (
        <div className="mb-6">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Observations</h2>
          <div className="space-y-3">
            {grouped["__obs"].map((e) => (
              <EntryCard key={e.uid} entry={e} onUpdate={updateEntry} onRemove={removeEntry} />
            ))}
          </div>
        </div>
      ) : null}

      <Button variant="outline" className="w-full" onClick={addObservation} data-testid="button-add-observation">
        <Plus className="mr-2 h-4 w-4" /> Add observation
      </Button>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur md:left-64">
        <div className="mx-auto flex max-w-5xl gap-3 px-4 py-3">
          <Button variant="outline" className="flex-1" disabled={save.isPending} onClick={() => save.mutate("draft")} data-testid="button-save-draft">
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save draft
          </Button>
          <Button className="flex-1" disabled={save.isPending} onClick={() => {
            const err = validateSubmit();
            if (err) { toast({ title: "Cannot submit", description: err, variant: "destructive" }); return; }
            save.mutate("submitted");
          }} data-testid="button-submit-inspection">
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Submit
          </Button>
        </div>
      </div>
    </div>
  );
}

function EntryCard({
  entry,
  onUpdate,
  onRemove,
}: {
  entry: EntryState;
  onUpdate: (uid: string, patch: Partial<EntryState>) => void;
  onRemove: ((uid: string) => void) | null;
}) {
  const showSeverity = entry.isObservation || entry.status === "fail";
  return (
    <Card data-testid={`entry-card-${entry.uid}`}>
      <CardContent className="space-y-3 p-4">
        {entry.isObservation ? (
          <div className="flex items-start gap-2">
            <Input
              value={entry.label}
              onChange={(ev) => onUpdate(entry.uid, { label: ev.target.value })}
              placeholder="Observation title"
              data-testid="input-observation-title"
              className="font-medium"
            />
            {onRemove && (
              <Button variant="ghost" size="icon" className="h-9 w-9 flex-shrink-0 text-destructive" onClick={() => onRemove(entry.uid)} data-testid="button-remove-observation">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium leading-snug">
              {entry.label}
              {entry.requiresPhoto && (
                <Camera className="ml-1.5 inline h-3.5 w-3.5 text-muted-foreground" />
              )}
            </p>
          </div>
        )}

        {!entry.isObservation && (
          <div className="grid grid-cols-3 gap-2">
            {STATUS_OPTS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                data-on={entry.status === opt.value}
                onClick={() => onUpdate(entry.uid, { status: opt.value, severity: opt.value === "fail" ? entry.severity || "minor" : null })}
                data-testid={`button-status-${opt.value}-${entry.uid}`}
                className={cn(
                  "rounded-md border py-2.5 text-sm font-medium transition-colors",
                  entry.status === opt.value ? "" : "bg-background text-foreground hover:bg-accent",
                  opt.cls
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {showSeverity && (
          <div className="space-y-1.5">
            <Label className="text-xs">Severity{entry.status === "fail" ? " *" : ""}</Label>
            <Select value={entry.severity || undefined} onValueChange={(v) => onUpdate(entry.uid, { severity: v })}>
              <SelectTrigger data-testid={`select-severity-${entry.uid}`}><SelectValue placeholder="Select severity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="minor">Minor</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <Textarea
          value={entry.note}
          onChange={(ev) => onUpdate(entry.uid, { note: ev.target.value })}
          placeholder="Notes (optional)"
          rows={2}
          data-testid={`input-note-${entry.uid}`}
        />

        <PhotoUploader photos={entry.photos} onChange={(p) => onUpdate(entry.uid, { photos: p })} />
      </CardContent>
    </Card>
  );
}

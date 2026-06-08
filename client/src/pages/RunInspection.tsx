import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, API_BASE } from "@/lib/queryClient";
import { queuePatch } from "@/lib/offline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PhotoUploader, UploadedPhoto } from "@/components/PhotoUploader";
import { VoiceInput } from "@/components/VoiceInput";
import { AiPhotoSuggestion, NotePolish } from "@/components/AiSuggestion";
import { PreviousFlagged } from "@/components/PreviousFlagged";
import { useAiStatus } from "@/hooks/use-ai-status";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Camera, Plus, Save, Send, Trash2, Loader2, ArrowLeft, Check } from "lucide-react";
import { format } from "date-fns";
import type { Site, ChecklistItem, Inspection, InspectionEntry, Photo } from "@shared/schema";

type InspectionDetail = {
  inspection: Inspection;
  site: Site;
  entries: Array<InspectionEntry & { photos: Photo[] }>;
};

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
  const aiEnabled = useAiStatus();

  const inspectionId = Number(params.inspectionId);

  const { data: site } = useQuery<Site>({ queryKey: ["/api/sites", siteId] });
  const { data: checklist, isLoading } = useQuery<ChecklistItem[]>({ queryKey: ["/api/sites", siteId, "checklist"] });
  const { data: inspectionData } = useQuery<InspectionDetail>({ queryKey: ["/api/inspections", inspectionId], enabled: !!inspectionId });
  const inspection = inspectionData?.inspection;
  const savedEntries = inspectionData?.entries;

  const [entries, setEntries] = useState<EntryState[]>([]);
  const [weather, setWeather] = useState("");
  const [generalNotes, setGeneralNotes] = useState("");
  const [inspectorName, setInspectorName] = useState("");
  const [initialised, setInitialised] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [savedAgo, setSavedAgo] = useState<string>("");

  useEffect(() => {
    if (initialised || !checklist) return;
    // If we have an inspection record (existing draft), wait for its entries
    // to load before initialising so a saved draft is restored intact.
    if (inspectionId && !inspectionData) return;

    setInspectorName(inspection?.inspectorName || user?.name || "");
    setWeather(inspection?.weather || "");
    setGeneralNotes(inspection?.generalNotes || "");

    // Build a checklist-id-indexed map of saved entries so we can restore
    // status, note, severity and photos when reopening a draft. Observation
    // entries (no checklist id) are appended as-is at the end.
    const byChecklistId = new Map<number, (typeof savedEntries)[number]>();
    const observations: typeof savedEntries = [] as any;
    for (const e of savedEntries || []) {
      if (e.checklistItemId != null) byChecklistId.set(e.checklistItemId, e);
      else if (e.isObservation) (observations as any[]).push(e);
    }

    const restored: EntryState[] = checklist.map((c) => {
      const saved = byChecklistId.get(c.id);
      return {
        uid: `cl-${c.id}`,
        checklistItemId: c.id,
        label: c.label,
        section: c.section,
        requiresPhoto: c.requiresPhoto,
        status: (saved?.status as any) || "na",
        note: saved?.note || "",
        severity: saved?.severity ?? null,
        isObservation: false,
        photos: (saved?.photos || []).map((p) => ({ id: p.id, url: `/uploads/${p.filePath}` })),
      };
    });

    for (const o of observations || []) {
      restored.push({
        uid: `obs-${o.id}`,
        checklistItemId: null,
        label: o.label || "",
        section: "Observation",
        requiresPhoto: false,
        status: "observation",
        note: o.note || "",
        severity: o.severity ?? "minor",
        isObservation: true,
        photos: (o.photos || []).map((p) => ({ id: p.id, url: `/uploads/${p.filePath}` })),
      });
    }

    setEntries(restored);
    setInitialised(true);
  }, [checklist, initialised, user, inspectionData, inspectionId, inspection, savedEntries]);

  function buildEntriesPayload() {
    return entries.map((e) => ({
      checklistItemId: e.checklistItemId,
      label: e.label,
      section: e.section,
      status: e.status,
      note: e.note,
      severity: e.status === "fail" || e.isObservation ? e.severity : null,
      isObservation: e.isObservation,
      photoIds: e.photos.map((p) => p.id),
    }));
  }

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

  // Autosave: PATCH a draft snapshot. Queues offline if the request fails.
  const autosaveRef = useRef<number | null>(null);
  async function autosave() {
    if (!inspectionId || !initialised) return;
    const body = { entries: buildEntriesPayload(), weather, generalNotes, inspectorName };
    try {
      await apiRequest("PATCH", `/api/inspections/${inspectionId}`, body);
      setLastSaved(Date.now());
    } catch {
      // Network down or server error: queue for later and still mark a save time.
      await queuePatch(`/api/inspections/${inspectionId}`, body);
      setLastSaved(Date.now());
    }
  }
  function scheduleAutosave() {
    if (autosaveRef.current) window.clearTimeout(autosaveRef.current);
    autosaveRef.current = window.setTimeout(autosave, 800);
  }

  // Periodic autosave every 5s once there is something to save.
  useEffect(() => {
    if (!initialised) return;
    const id = window.setInterval(autosave, 5000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialised, entries, weather, generalNotes, inspectorName]);

  // "Saved Ns ago" ticker.
  useEffect(() => {
    if (!lastSaved) return;
    const tick = () => {
      const secs = Math.round((Date.now() - lastSaved) / 1000);
      setSavedAgo(secs < 2 ? "just now" : `${secs}s ago`);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [lastSaved]);

  const save = useMutation({
    mutationFn: async (status: "draft" | "submitted") => {
      const payload = {
        status,
        weather,
        generalNotes,
        inspectorName,
        entries: buildEntriesPayload(),
      };
      return (await apiRequest("POST", `/api/inspections/${inspectionId}/save`, payload)).json();
    },
    onSuccess: (_d, status) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sites", siteId, "inspections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inspections", inspectionId] });
      if (status === "submitted") {
        toast({ title: "Inspection submitted", description: "Report generated." });
        navigate(`/inspections/${inspectionId}`);
      } else {
        setLastSaved(Date.now());
        toast({ title: "Draft saved" });
      }
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  // Returns the list of failed items that have no photo (a soft block on submit).
  function failsMissingPhotos(): string[] {
    return entries
      .filter((e) => e.status === "fail" && e.photos.length === 0)
      .map((e) => e.label || "Untitled item");
  }

  function validateSubmit(): string | null {
    for (const e of entries) {
      if (!e.isObservation && e.status === "fail" && !e.severity)
        return `Set a severity for failed item "${e.label}".`;
      if (e.requiresPhoto && e.status !== "na" && e.photos.length === 0)
        return `Photo required for "${e.label}".`;
      if (e.isObservation && !e.label.trim())
        return "Give each observation a short title.";
    }
    const missing = failsMissingPhotos();
    if (missing.length > 0)
      return `Add at least one photo to each failed item: ${missing.join(", ")}.`;
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

      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-xl font-semibold">{site?.name}</h1>
          <p className="text-sm text-muted-foreground">
            {inspectorName || user?.name} · {format(new Date(inspection?.startedAt || Date.now()), "d MMM yyyy, h:mm a")}
          </p>
        </div>
        {lastSaved && (
          <span className="flex flex-shrink-0 items-center gap-1.5 text-xs text-muted-foreground" data-testid="text-saved-indicator">
            <Check className="h-3.5 w-3.5 text-emerald-600" /> Saved {savedAgo}
          </span>
        )}
      </div>

      {/* Previous flagged items for comparison */}
      {inspectionId ? <PreviousFlagged siteId={siteId} beforeId={inspectionId} /> : null}

      {/* Top fields */}
      <Card className="mb-5">
        <CardContent className="space-y-4 p-4">
          <div className="space-y-2">
            <Label htmlFor="inspector">Inspector</Label>
            <Input id="inspector" value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} onBlur={autosave} data-testid="input-inspector-name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="weather">Weather / conditions (optional)</Label>
            <Input id="weather" value={weather} onChange={(e) => setWeather(e.target.value)} onBlur={autosave} placeholder="e.g. Fine, 24 degrees" data-testid="input-weather" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="gnotes">General notes (optional)</Label>
              <VoiceInput testId="button-voice-general" onAppend={(t) => setGeneralNotes((prev) => (prev ? prev + " " + t : t))} />
            </div>
            <Textarea id="gnotes" value={generalNotes} onChange={(e) => setGeneralNotes(e.target.value)} onBlur={autosave} rows={2} data-testid="input-general-notes" />
          </div>
        </CardContent>
      </Card>

      {/* Checklist sections */}
      {sectionKeys.map((section) => (
        <div key={section} className="mb-6">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{section}</h2>
          <div className="space-y-3">
            {grouped[section].map((e) => (
              <EntryCard key={e.uid} entry={e} siteName={site?.name || ""} aiEnabled={aiEnabled}
                onUpdate={updateEntry} onRemove={null} onBlurSave={autosave} onChangeSchedule={scheduleAutosave} />
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
              <EntryCard key={e.uid} entry={e} siteName={site?.name || ""} aiEnabled={aiEnabled}
                onUpdate={updateEntry} onRemove={removeEntry} onBlurSave={autosave} onChangeSchedule={scheduleAutosave} />
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
  siteName,
  aiEnabled,
  onUpdate,
  onRemove,
  onBlurSave,
  onChangeSchedule,
}: {
  entry: EntryState;
  siteName: string;
  aiEnabled: boolean;
  onUpdate: (uid: string, patch: Partial<EntryState>) => void;
  onRemove: ((uid: string) => void) | null;
  onBlurSave: () => void;
  onChangeSchedule: () => void;
}) {
  const showSeverity = entry.isObservation || entry.status === "fail";
  const showAi = entry.status === "fail" || entry.isObservation;
  const photoRequiredFail = entry.status === "fail" && entry.photos.length === 0;
  const lastPhotoUrl = entry.photos.length ? `${API_BASE}${entry.photos[entry.photos.length - 1].url}` : null;

  return (
    <Card data-testid={`entry-card-${entry.uid}`}>
      <CardContent className="space-y-3 p-4">
        {entry.isObservation ? (
          <div className="flex items-start gap-2">
            <Input
              value={entry.label}
              onChange={(ev) => { onUpdate(entry.uid, { label: ev.target.value }); onChangeSchedule(); }}
              onBlur={onBlurSave}
              placeholder="Observation title"
              data-testid="input-observation-title"
              className="font-medium"
            />
            {onRemove && (
              <Button variant="ghost" size="icon" className="h-9 w-9 flex-shrink-0 text-destructive" onClick={() => { onRemove(entry.uid); onChangeSchedule(); }} data-testid="button-remove-observation">
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
            {photoRequiredFail && (
              <Badge className="flex-shrink-0 border-transparent bg-amber-500 text-white" data-testid={`badge-photo-required-${entry.uid}`}>
                Photo required
              </Badge>
            )}
          </div>
        )}

        {!entry.isObservation && (
          <div className="grid grid-cols-3 gap-2">
            {STATUS_OPTS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                data-on={entry.status === opt.value}
                onClick={() => { onUpdate(entry.uid, { status: opt.value, severity: opt.value === "fail" ? entry.severity || "minor" : null }); onChangeSchedule(); }}
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
            <Select value={entry.severity || undefined} onValueChange={(v) => { onUpdate(entry.uid, { severity: v }); onChangeSchedule(); }}>
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

        <div className="space-y-1.5">
          <div className="flex items-center justify-end gap-1">
            <NotePolish text={entry.note} itemLabel={entry.label} siteName={siteName} aiEnabled={aiEnabled}
              onReplace={(t) => { onUpdate(entry.uid, { note: t }); onChangeSchedule(); }} />
            <VoiceInput testId={`button-voice-${entry.uid}`} onAppend={(t) => { onUpdate(entry.uid, { note: entry.note ? entry.note + " " + t : t }); onChangeSchedule(); }} />
          </div>
          <Textarea
            value={entry.note}
            onChange={(ev) => { onUpdate(entry.uid, { note: ev.target.value }); onChangeSchedule(); }}
            onBlur={onBlurSave}
            placeholder="Notes (optional)"
            rows={2}
            data-testid={`input-note-${entry.uid}`}
          />
        </div>

        <PhotoUploader photos={entry.photos} onChange={(p) => { onUpdate(entry.uid, { photos: p }); onChangeSchedule(); }} />

        {showAi && lastPhotoUrl && (
          <AiPhotoSuggestion
            photoUrl={entry.photos[entry.photos.length - 1].url}
            itemLabel={entry.label}
            siteName={siteName}
            aiEnabled={aiEnabled}
            onUseDescription={(t) => { onUpdate(entry.uid, { note: t }); onChangeSchedule(); }}
            onUseSeverity={(s) => { onUpdate(entry.uid, { severity: s }); onChangeSchedule(); }}
          />
        )}
      </CardContent>
    </Card>
  );
}

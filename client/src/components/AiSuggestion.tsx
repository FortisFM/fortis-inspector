import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Loader2, Check } from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";

interface PhotoAnalysis {
  description: string;
  severity: "Info" | "Minor" | "Moderate" | "Urgent";
  suggestedAction: string;
}

// Card shown under photos on Fail / Observation entries. Calls the AI photo
// analysis endpoint. Suggestions are never auto-applied; the inspector chooses
// description, severity or both.
export function AiPhotoSuggestion({
  photoUrl,
  itemLabel,
  siteName,
  aiEnabled,
  onUseDescription,
  onUseSeverity,
}: {
  photoUrl: string;
  itemLabel: string;
  siteName: string;
  aiEnabled: boolean;
  onUseDescription: (text: string) => void;
  onUseSeverity: (sev: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PhotoAnalysis | null>(null);
  const { toast } = useToast();

  if (!aiEnabled) return null;

  async function analyse() {
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/ai/analyse-photo", {
        photoUrl,
        itemLabel,
        siteName,
      });
      setResult(await res.json());
    } catch (e: any) {
      toast({ title: "AI analysis failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  if (!result) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={analyse}
        disabled={loading}
        data-testid="button-ai-analyse"
        className="text-primary"
      >
        {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
        Suggest details with AI
      </Button>
    );
  }

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3" data-testid="card-ai-suggestion">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
        <Sparkles className="h-3.5 w-3.5" /> AI suggestion
      </div>
      <p className="text-sm" data-testid="text-ai-description">{result.description}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Severity: <span className="font-medium">{result.severity}</span>
      </p>
      {result.suggestedAction && (
        <p className="mt-1 text-xs text-muted-foreground">Action: {result.suggestedAction}</p>
      )}
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" data-testid="button-ai-use-description"
          onClick={() => onUseDescription(result.description)}>
          Use description
        </Button>
        <Button type="button" size="sm" variant="outline" data-testid="button-ai-use-severity"
          onClick={() => onUseSeverity(result.severity.toLowerCase())}>
          Use severity
        </Button>
        <Button type="button" size="sm" data-testid="button-ai-use-both"
          onClick={() => { onUseDescription(result.description); onUseSeverity(result.severity.toLowerCase()); }}>
          Use both
        </Button>
      </div>
    </div>
  );
}

// "Polish" button shown beside a note when it contains text. Calls the polish
// endpoint and offers Replace / Cancel in a popover.
export function NotePolish({
  text,
  itemLabel,
  siteName,
  aiEnabled,
  onReplace,
}: {
  text: string;
  itemLabel: string;
  siteName: string;
  aiEnabled: boolean;
  onReplace: (text: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [polished, setPolished] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  if (!aiEnabled || !text.trim()) return null;

  async function polish() {
    setLoading(true);
    setPolished(null);
    setOpen(true);
    try {
      const res = await apiRequest("POST", "/api/ai/polish-note", { text, itemLabel, siteName });
      const data = await res.json();
      setPolished(data.text);
    } catch (e: any) {
      setOpen(false);
      toast({ title: "Polish failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" onClick={polish} disabled={loading}
          data-testid="button-polish-note" className="h-8 px-2 text-primary">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          <span className="ml-1 text-xs">Polish</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        {loading || !polished ? (
          <p className="text-sm text-muted-foreground">Polishing note...</p>
        ) : (
          <div className="space-y-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Polished note</p>
            <p className="text-sm" data-testid="text-polished-note">{polished}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)} data-testid="button-polish-cancel">
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={() => { onReplace(polished); setOpen(false); }} data-testid="button-polish-replace">
                <Check className="mr-1 h-3.5 w-3.5" /> Replace
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

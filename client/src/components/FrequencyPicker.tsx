import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FREQUENCY_OPTIONS } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { dueInfo } from "@/lib/due";
import { cn } from "@/lib/utils";

// Frequency select plus a custom day-count input. Used in the site create and
// edit forms.
export function FrequencyPicker({
  value,
  customDays,
  onValueChange,
  onCustomDaysChange,
}: {
  value: string;
  customDays: number;
  onValueChange: (v: string) => void;
  onCustomDaysChange: (n: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="frequency">Inspection frequency</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id="frequency" data-testid="select-frequency">
          <SelectValue placeholder="Select frequency" />
        </SelectTrigger>
        <SelectContent>
          {FREQUENCY_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value === "custom" && (
        <div className="flex items-center gap-2 pt-1">
          <Input
            type="number"
            min={1}
            value={customDays}
            onChange={(e) => onCustomDaysChange(Number(e.target.value))}
            className="w-28"
            data-testid="input-custom-days"
          />
          <span className="text-sm text-muted-foreground">days between inspections</span>
        </div>
      )}
    </div>
  );
}

const TONE: Record<string, string> = {
  overdue: "bg-red-100 text-red-700 border-red-200",
  soon: "bg-amber-100 text-amber-700 border-amber-200",
  upcoming: "bg-slate-100 text-slate-600 border-slate-200",
};

export function DueBadge({ nextDueDate }: { nextDueDate: string | null | undefined }) {
  const info = dueInfo(nextDueDate);
  if (info.tone === "none") return null;
  return (
    <Badge variant="outline" className={cn(TONE[info.tone])} data-testid="badge-due">
      {info.label}
    </Badge>
  );
}

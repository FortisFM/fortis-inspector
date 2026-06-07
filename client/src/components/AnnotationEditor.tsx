import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ArrowUpRight, Circle, Pencil, Type, Undo2, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Tool = "arrow" | "ellipse" | "free" | "text";
interface Pt { x: number; y: number }
interface Shape {
  tool: Tool;
  colour: string;
  width: number;
  start: Pt;
  end: Pt;
  points?: Pt[];
  text?: string;
}

const COLOURS = [
  { name: "Red", value: "#ef4444" },
  { name: "Navy", value: "#090b38" },
  { name: "Amber", value: "#f59e0b" },
  { name: "White", value: "#ffffff" },
];

// Lightweight raw-canvas annotation editor. React 18 rules out react-konva
// (needs React 19), so shapes are drawn directly on a 2D canvas. Supports
// arrow, ellipse, freehand and text, with undo, clear, colour and width.
export function AnnotationEditor({
  imageUrl,
  open,
  onSave,
  onSkip,
  saving,
}: {
  imageUrl: string;
  open: boolean;
  onSave: (blob: Blob) => void;
  onSkip: () => void;
  saving: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>("arrow");
  const [colour, setColour] = useState("#ef4444");
  const [width, setWidth] = useState(6);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [drawing, setDrawing] = useState<Shape | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Load the source image and size the canvas to it.
  useEffect(() => {
    if (!open) return;
    setShapes([]);
    setDrawing(null);
    setLoaded(false);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
      }
      setLoaded(true);
    };
    img.src = imageUrl;
  }, [imageUrl, open]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const all = drawing ? [...shapes, drawing] : shapes;
    for (const s of all) drawShape(ctx, s);
  }, [shapes, drawing]);

  useEffect(() => {
    if (loaded) redraw();
  }, [loaded, redraw]);

  function toCanvasPoint(e: { clientX: number; clientY: number }): Pt {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function pointerDown(e: React.PointerEvent) {
    e.preventDefault();
    const p = toCanvasPoint(e);
    if (tool === "text") {
      const value = window.prompt("Label text");
      if (value && value.trim()) {
        setShapes((prev) => [...prev, { tool: "text", colour, width, start: p, end: p, text: value.trim() }]);
      }
      return;
    }
    setDrawing({ tool, colour, width, start: p, end: p, points: tool === "free" ? [p] : undefined });
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function pointerMove(e: React.PointerEvent) {
    if (!drawing) return;
    e.preventDefault();
    const p = toCanvasPoint(e);
    setDrawing((d) =>
      d
        ? {
            ...d,
            end: p,
            points: d.tool === "free" ? [...(d.points || []), p] : d.points,
          }
        : d
    );
  }
  function pointerUp() {
    if (drawing) {
      setShapes((prev) => [...prev, drawing]);
      setDrawing(null);
    }
  }

  function undo() {
    setShapes((prev) => prev.slice(0, -1));
  }
  function clearAll() {
    setShapes([]);
  }

  function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(
      (blob) => {
        if (blob) onSave(blob);
      },
      "image/jpeg",
      0.85
    );
  }

  const TOOLS: { value: Tool; label: string; icon: any }[] = [
    { value: "arrow", label: "Arrow", icon: ArrowUpRight },
    { value: "ellipse", label: "Circle", icon: Circle },
    { value: "free", label: "Draw", icon: Pencil },
    { value: "text", label: "Text", icon: Type },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onSkip(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Mark up photo</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            return (
              <Button
                key={t.value}
                type="button"
                size="sm"
                variant={tool === t.value ? "default" : "outline"}
                onClick={() => setTool(t.value)}
                data-testid={`button-tool-${t.value}`}
              >
                <Icon className="mr-1.5 h-4 w-4" />
                {t.label}
              </Button>
            );
          })}
          <Button type="button" size="sm" variant="outline" onClick={undo} data-testid="button-annotate-undo">
            <Undo2 className="mr-1.5 h-4 w-4" /> Undo
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={clearAll} data-testid="button-annotate-clear">
            <Trash2 className="mr-1.5 h-4 w-4" /> Clear
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            {COLOURS.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-label={c.name}
                onClick={() => setColour(c.value)}
                data-testid={`button-colour-${c.name.toLowerCase()}`}
                className={cn(
                  "h-7 w-7 rounded-full border-2",
                  colour === c.value ? "border-foreground" : "border-border"
                )}
                style={{ background: c.value }}
              />
            ))}
          </div>
          <div className="flex min-w-[140px] flex-1 items-center gap-2">
            <span className="text-xs text-muted-foreground">Width</span>
            <Slider value={[width]} min={2} max={20} step={1} onValueChange={(v) => setWidth(v[0])} data-testid="slider-stroke-width" />
            <span className="w-6 text-xs tabular-nums text-muted-foreground">{width}</span>
          </div>
        </div>

        <div className="flex max-h-[55vh] items-center justify-center overflow-auto rounded-md border bg-muted/30">
          {!loaded ? (
            <div className="flex h-48 items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              onPointerDown={pointerDown}
              onPointerMove={pointerMove}
              onPointerUp={pointerUp}
              onPointerLeave={pointerUp}
              className="max-w-full touch-none"
              style={{ cursor: "crosshair" }}
              data-testid="canvas-annotate"
            />
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onSkip} disabled={saving} data-testid="button-annotate-skip">
            Skip
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving} data-testid="button-annotate-save">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save markup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function drawShape(ctx: CanvasRenderingContext2D, s: Shape) {
  ctx.strokeStyle = s.colour;
  ctx.fillStyle = s.colour;
  ctx.lineWidth = s.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (s.tool === "arrow") {
    drawArrow(ctx, s.start, s.end, s.width);
  } else if (s.tool === "ellipse") {
    const cx = (s.start.x + s.end.x) / 2;
    const cy = (s.start.y + s.end.y) / 2;
    const rx = Math.abs(s.end.x - s.start.x) / 2;
    const ry = Math.abs(s.end.y - s.start.y) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (s.tool === "free" && s.points && s.points.length > 1) {
    ctx.beginPath();
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (const p of s.points.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  } else if (s.tool === "text" && s.text) {
    const size = Math.max(24, s.width * 6);
    ctx.font = `bold ${size}px Montserrat, sans-serif`;
    ctx.textBaseline = "top";
    // Light outline so text reads on any background.
    ctx.lineWidth = Math.max(3, size / 8);
    ctx.strokeStyle = s.colour === "#ffffff" ? "#090b38" : "#ffffff";
    ctx.strokeText(s.text, s.start.x, s.start.y);
    ctx.fillStyle = s.colour;
    ctx.fillText(s.text, s.start.x, s.start.y);
  }
}

function drawArrow(ctx: CanvasRenderingContext2D, from: Pt, to: Pt, width: number) {
  const head = Math.max(14, width * 3);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - head * Math.cos(angle - Math.PI / 6), to.y - head * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(to.x - head * Math.cos(angle + Math.PI / 6), to.y - head * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

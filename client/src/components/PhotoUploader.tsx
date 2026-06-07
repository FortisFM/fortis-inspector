import { useRef, useState } from "react";
import { uploadPhoto, API_BASE } from "@/lib/queryClient";
import { Camera, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export interface UploadedPhoto {
  id: number;
  url: string;
}

export function PhotoUploader({
  photos,
  onChange,
  label = "Add photo",
}: {
  photos: UploadedPhoto[];
  onChange: (p: UploadedPhoto[]) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const results: UploadedPhoto[] = [];
      for (const file of Array.from(files)) {
        const res = await uploadPhoto(file);
        results.push({ id: res.id, url: res.url });
      }
      onChange([...photos, ...results]);
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <div key={p.id} className="relative h-20 w-20 overflow-hidden rounded-md border" data-testid={`photo-thumb-${p.id}`}>
            <img src={`${API_BASE}${p.url}`} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(photos.filter((x) => x.id !== p.id))}
              className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
              data-testid={`button-remove-photo-${p.id}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          data-testid="button-add-photo"
          className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-muted-foreground hover:border-primary hover:text-primary"
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
          <span className="text-[10px] leading-tight">{uploading ? "…" : label}</span>
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}

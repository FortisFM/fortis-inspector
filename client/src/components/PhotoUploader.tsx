import { useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { uploadPhoto, API_BASE, getAuthToken } from "@/lib/queryClient";
import { Camera, FolderOpen, X, Loader2, PenLine } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AnnotationEditor } from "@/components/AnnotationEditor";

export interface UploadedPhoto {
  id: number;
  url: string;
}

const COMPRESS_OPTS = {
  maxWidthOrHeight: 1920,
  initialQuality: 0.82,
  useWebWorker: true,
  fileType: "image/jpeg",
};

export function PhotoUploader({
  photos,
  onChange,
}: {
  photos: UploadedPhoto[];
  onChange: (p: UploadedPhoto[]) => void;
  label?: string;
}) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [optimising, setOptimising] = useState(false);
  const { toast } = useToast();

  // Annotation state: which photo is being marked up, and its source URL.
  const [annotateUrl, setAnnotateUrl] = useState<string | null>(null);
  const [annotatePhotoId, setAnnotatePhotoId] = useState<number | null>(null);
  const [savingAnnotation, setSavingAnnotation] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const results: UploadedPhoto[] = [];
      for (const file of Array.from(files)) {
        setOptimising(true);
        let toUpload: File = file;
        try {
          const compressed = await imageCompression(file, COMPRESS_OPTS);
          toUpload = new File([compressed], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
            type: "image/jpeg",
          });
        } catch {
          // If compression fails, fall back to the original file.
          toUpload = file;
        }
        setOptimising(false);
        const res = await uploadPhoto(toUpload);
        results.push({ id: res.id, url: res.url });
      }
      onChange([...photos, ...results]);
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
      setOptimising(false);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  }

  function openAnnotate(p: UploadedPhoto) {
    setAnnotateUrl(`${API_BASE}${p.url}`);
    setAnnotatePhotoId(p.id);
  }

  async function saveAnnotation(blob: Blob) {
    if (annotatePhotoId == null) return;
    setSavingAnnotation(true);
    try {
      const file = new File([blob], "annotated.jpg", { type: "image/jpeg" });
      const fd = new FormData();
      fd.append("photo", file);
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/photos?annotated=1`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) throw new Error("Could not save markup");
      const data = await res.json();
      // Replace the original photo with the annotated one in this entry.
      onChange(photos.map((p) => (p.id === annotatePhotoId ? { id: data.id, url: data.url } : p)));
      toast({ title: "Markup saved" });
    } catch (e: any) {
      toast({ title: "Markup failed", description: e.message, variant: "destructive" });
    } finally {
      setSavingAnnotation(false);
      setAnnotateUrl(null);
      setAnnotatePhotoId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <div key={p.id} className="group relative h-20 w-20 overflow-hidden rounded-md border" data-testid={`photo-thumb-${p.id}`}>
            <img src={`${API_BASE}${p.url}`} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(photos.filter((x) => x.id !== p.id))}
              className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
              data-testid={`button-remove-photo-${p.id}`}
            >
              <X className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => openAnnotate(p)}
              className="absolute bottom-0.5 right-0.5 rounded-full bg-black/60 p-1 text-white"
              data-testid={`button-annotate-photo-${p.id}`}
              aria-label="Mark up photo"
            >
              <PenLine className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={uploading}
          data-testid="button-add-photo-camera"
          aria-label="Take photo"
          className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-muted-foreground hover:border-primary hover:text-primary"
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
          <span className="text-[10px] leading-tight">{uploading ? "..." : "Camera"}</span>
        </button>
        <button
          type="button"
          onClick={() => galleryInputRef.current?.click()}
          disabled={uploading}
          data-testid="button-add-photo-gallery"
          aria-label="Choose from files or gallery"
          className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-muted-foreground hover:border-primary hover:text-primary"
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <FolderOpen className="h-5 w-5" />}
          <span className="text-[10px] leading-tight">{uploading ? "..." : "Files"}</span>
        </button>
      </div>

      {optimising && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="text-optimising">
          <Loader2 className="h-3 w-3 animate-spin" /> Optimising photo...
        </p>
      )}

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {annotateUrl && (
        <AnnotationEditor
          imageUrl={annotateUrl}
          open={!!annotateUrl}
          saving={savingAnnotation}
          onSave={saveAnnotation}
          onSkip={() => {
            setAnnotateUrl(null);
            setAnnotatePhotoId(null);
          }}
        />
      )}
    </div>
  );
}

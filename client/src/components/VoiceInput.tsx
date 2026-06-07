import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";

// Voice-to-text using the browser Web Speech API. Appends to existing text
// rather than replacing. Renders nothing when the API is unsupported.
function getRecognition(): any | null {
  const w = window as any;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function VoiceInput({
  onAppend,
  testId,
}: {
  onAppend: (text: string) => void;
  testId?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);

  useEffect(() => {
    const rec = getRecognition();
    if (!rec) return;
    setSupported(true);
    rec.lang = "en-AU";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (ev: any) => {
      let transcript = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        transcript += ev.results[i][0].transcript;
      }
      if (transcript.trim()) onAppend(transcript.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    return () => {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    };
    // onAppend is stable enough for this use; we intentionally set up once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!supported) return null;

  function toggle() {
    const rec = recRef.current;
    if (!rec) return;
    if (listening) {
      rec.stop();
      setListening(false);
    } else {
      try {
        rec.start();
        setListening(true);
      } catch {
        /* start can throw if already running */
      }
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={listening ? "Stop dictation" : "Dictate note"}
      data-testid={testId || "button-voice"}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
        listening
          ? "border-red-500 bg-red-50 text-red-600"
          : "text-muted-foreground hover:border-primary hover:text-primary"
      )}
    >
      {listening ? (
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-red-600" />
        </span>
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </button>
  );
}

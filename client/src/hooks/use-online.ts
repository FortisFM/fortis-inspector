import { useEffect, useState } from "react";
import { drainQueue, queueCount, onQueueChange, pingHealth } from "@/lib/offline";

// Tracks online/offline state and the number of queued items. When the
// connection returns, the queue is drained automatically.
export function useOnline() {
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [queued, setQueued] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const c = await queueCount();
      if (!cancelled) setQueued(c);
    }
    refresh();
    const unsub = onQueueChange(refresh);

    async function goOnline() {
      const reachable = await pingHealth();
      if (cancelled) return;
      setOnline(reachable);
      if (reachable) {
        await drainQueue();
        refresh();
      }
    }
    function goOffline() {
      setOnline(false);
    }

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    // Periodic check so we recover even without an explicit online event.
    const interval = window.setInterval(goOnline, 20000);

    return () => {
      cancelled = true;
      unsub();
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.clearInterval(interval);
    };
  }, []);

  return { online, queued };
}

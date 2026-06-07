import { useQuery } from "@tanstack/react-query";

// Whether AI features are available (server has OPENAI_API_KEY configured).
export function useAiStatus(): boolean {
  const { data } = useQuery<{ enabled: boolean }>({ queryKey: ["/api/ai/status"] });
  return !!data?.enabled;
}

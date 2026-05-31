// Lightweight timestamped console logging for diagnosing latency.
// On in dev; in production set localStorage.ivDebug = "1" to enable.

const enabled =
  import.meta.env.DEV ||
  (typeof localStorage !== "undefined" && localStorage.getItem("ivDebug") === "1");

export const now = (): number => performance.now();
export const since = (start: number): number => Math.round(performance.now() - start);

export function ilog(scope: string, msg: string, data?: Record<string, unknown>): void {
  if (!enabled) return;
  const t = (performance.now() / 1000).toFixed(2);
  const extra = data
    ? " " +
      Object.entries(data)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")
    : "";
  // eslint-disable-next-line no-console
  console.info(`[${t}s] [${scope}] ${msg}${extra}`);
}

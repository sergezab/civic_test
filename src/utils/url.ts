import type { Format, Mode, Pool } from "../components/StartScreen";

export interface UrlParams {
  format: Format | null;
  mode: Mode | null;
  pool: Pool | null;
  count: number | null;
  q: number | null;
  stage: string | null;
}

const FORMATS = new Set<Format>(["quiz", "flash", "interview"]);
const MODES = new Set<Mode>(["test", "practice"]);
const POOLS = new Set<Pool>(["all", "senior", "bookmarks"]);

function readEnum<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: ReadonlySet<T>,
): T | null {
  const value = params.get(key);
  return value !== null && allowed.has(value as T) ? (value as T) : null;
}

function readPositiveInt(params: URLSearchParams, key: string): number | null {
  const value = params.get(key);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function readUrlParams(): UrlParams {
  const p = new URLSearchParams(window.location.search);
  return {
    format: readEnum(p, "format", FORMATS),
    mode: readEnum(p, "mode", MODES),
    pool: readEnum(p, "pool", POOLS),
    count: readPositiveInt(p, "count"),
    q: readPositiveInt(p, "q"),
    stage: p.get("stage"),
  };
}

export function setUrlParams(params: Partial<Record<string, string | null>>): void {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  window.history.replaceState(null, "", url.toString());
}

export function clearUrlParams(): void {
  window.history.replaceState(null, "", window.location.pathname);
}

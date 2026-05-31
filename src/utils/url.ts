export interface UrlParams {
  format: string | null;
  mode: string | null;
  pool: string | null;
  q: number | null;
  stage: string | null;
}

export function readUrlParams(): UrlParams {
  const p = new URLSearchParams(window.location.search);
  const qRaw = p.get("q");
  return {
    format: p.get("format"),
    mode: p.get("mode"),
    pool: p.get("pool"),
    q: qRaw !== null ? Number(qRaw) : null,
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

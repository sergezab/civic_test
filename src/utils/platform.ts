export function isIOSLike(
  nav: Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints"> | undefined =
    typeof navigator === "undefined" ? undefined : navigator,
): boolean {
  if (!nav) return false;
  return /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
}

export function isIOSWebKitShell(
  nav: Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints"> | undefined =
    typeof navigator === "undefined" ? undefined : navigator,
): boolean {
  if (!isIOSLike(nav)) return false;
  return /\b(CriOS|FxiOS|EdgiOS|OPiOS)\b/.test(nav?.userAgent ?? "");
}

import { describe, expect, it } from "vitest";
import { isIOSLike, isIOSWebKitShell } from "./platform";

describe("platform helpers", () => {
  it("detects iPadOS Safari-style desktop user agents", () => {
    expect(
      isIOSLike({
        maxTouchPoints: 5,
        platform: "MacIntel",
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
      }),
    ).toBe(true);
  });

  it("detects iOS WebKit browser shells that should avoid live speech recognition", () => {
    expect(
      isIOSWebKitShell({
        maxTouchPoints: 5,
        platform: "iPad",
        userAgent:
          "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/120.0.0.0 Mobile/15E148 Safari/604.1",
      }),
    ).toBe(true);
  });

  it("leaves iPad Safari eligible for Web Speech recognition", () => {
    expect(
      isIOSWebKitShell({
        maxTouchPoints: 5,
        platform: "iPad",
        userAgent:
          "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
      }),
    ).toBe(false);
  });
});

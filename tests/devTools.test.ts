// devTools visibility: always on in dev, ?dev=1 opt-in on production builds.
import { afterEach, describe, expect, it, vi } from "vitest";
import { devToolsEnabled } from "../src/dev/devTools";

describe("devToolsEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is on in development regardless of the URL", () => {
    vi.stubEnv("DEV", true);
    expect(devToolsEnabled("")).toBe(true);
    expect(devToolsEnabled("?x=1")).toBe(true);
  });

  it("on production requires the dev query param", () => {
    vi.stubEnv("DEV", false);
    expect(devToolsEnabled("")).toBe(false);
    expect(devToolsEnabled("?foo=bar")).toBe(false);
    expect(devToolsEnabled("?dev=1")).toBe(true);
    expect(devToolsEnabled("?utm_source=dev&dev=1")).toBe(true);
  });
});

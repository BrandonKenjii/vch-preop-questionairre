import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// RTL's auto-cleanup hooks into vitest's afterEach; without globals it must
// be registered explicitly, otherwise renders leak between tests.
afterEach(cleanup);

// jsdom does not implement window.scrollTo (used by Wizard navigation).
if (typeof window !== "undefined") {
  vi.stubGlobal("scrollTo", vi.fn());
}

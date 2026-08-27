// When the dev toolbar should be visible: always in local development
// (import.meta.env.DEV), or on production builds when the URL carries
// ?dev=1 so the live deployment can be tested without exposing the
// auto-fill tools to patients browsing normally.
export function devToolsEnabled(search?: string): boolean {
  if (import.meta.env.DEV) return true;
  const query = search ?? (typeof window !== "undefined" ? window.location.search : "");
  return new URLSearchParams(query).has("dev");
}

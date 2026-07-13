export function getWsBase(): string {
  return (import.meta.env.VITE_API_BASE_URL || window.location.origin)
    .replace(/\/$/, "")
    .replace(/^https/, "wss")
    .replace(/^http/, "ws");
}

export function buildPrintWsUrl(
  session: string,
  opts?: { token?: string; stationToken?: string },
): string {
  let authParam = "";
  if (opts?.stationToken) {
    authParam = `?station_token=${encodeURIComponent(opts.stationToken)}`;
  } else if (opts?.token) {
    authParam = `?token=${opts.token}`;
  }
  return `${getWsBase()}/ws/print/${session}/${authParam}`;
}

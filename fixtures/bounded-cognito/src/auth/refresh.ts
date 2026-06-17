// Single-flight refresh: N concurrent 401s trigger ONE refresh.
// Used by the API client's 401 path. Owned, not inherited.

let inflight: Promise<boolean> | null = null;

export function refreshOnce(
  doRefresh: () => Promise<boolean>,
): Promise<boolean> {
  inflight ??= doRefresh().finally(() => {
    inflight = null;
  });
  return inflight;
}

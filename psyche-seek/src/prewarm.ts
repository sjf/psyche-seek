const prewarmed = new Set<string>();
let hoverTimer: number | null = null;

export function prewarmUser(user: string) {
  if (!user || prewarmed.has(user)) {
    return;
  }
  if (hoverTimer) {
    window.clearTimeout(hoverTimer);
  }
  hoverTimer = window.setTimeout(() => {
    prewarmed.add(user);
    fetch(`/api/user/${encodeURIComponent(user)}/prefetch`, { method: "POST" }).catch(() => {});
    fetch(`/api/user/${encodeURIComponent(user)}/info`).catch(() => {});
  }, 200);
}

export function cancelPrewarm() {
  if (hoverTimer) {
    window.clearTimeout(hoverTimer);
    hoverTimer = null;
  }
}

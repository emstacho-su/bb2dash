/**
 * The desktop shell's bridge, typed in one place (2026-09-30).
 *
 * Inside the Electron shell the preload exposes a frozen `window.bb2dashDesktop` of
 * `{ version, requestUpdate }` (desktop C-1, amended). In a normal browser it is absent,
 * and an older shell has only `version`; both mean "no Update desktop app item".
 *
 * `requestUpdate()` resolves with what main sends back. That crosses a process boundary,
 * so it is checked here before anything renders it: only the three known shapes pass, a
 * build is a short hex hash, and a reason is a capped plain string.
 */

export type DesktopUpdateResult =
  | { readonly status: 'up-to-date'; readonly build: string | null }
  | { readonly status: 'restarting'; readonly build: string }
  | { readonly status: 'failed'; readonly reason: string };

export type DesktopUpdater = () => Promise<unknown>;

export const MAX_REASON_LENGTH = 120;
const BUILD_PATTERN = /^[0-9a-f]{7,40}$/;

export const BRIDGE_FAILURES = Object.freeze({
  malformed: 'unexpected answer from the desktop app',
  refused: 'the desktop app refused the request',
});

/** `requestUpdate` when the shell provides it, otherwise `null`. */
export function getDesktopUpdater(): DesktopUpdater | null {
  if (typeof window === 'undefined') return null;
  const bridge = (window as Window & { bb2dashDesktop?: unknown }).bb2dashDesktop;
  if (bridge === null || typeof bridge !== 'object') return null;
  const requestUpdate = (bridge as { requestUpdate?: unknown }).requestUpdate;
  return typeof requestUpdate === 'function' ? (requestUpdate as DesktopUpdater) : null;
}

function isBuild(value: unknown): value is string {
  return typeof value === 'string' && BUILD_PATTERN.test(value);
}

/** The result, rebuilt from known fields only; `null` for anything else. */
export function parseUpdateResult(value: unknown): DesktopUpdateResult | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as { status?: unknown; build?: unknown; reason?: unknown };
  switch (record.status) {
    case 'up-to-date':
      if (record.build === null) return { status: 'up-to-date', build: null };
      return isBuild(record.build) ? { status: 'up-to-date', build: record.build } : null;
    case 'restarting':
      return isBuild(record.build) ? { status: 'restarting', build: record.build } : null;
    case 'failed': {
      if (typeof record.reason !== 'string') return null;
      const reason = record.reason.trim().slice(0, MAX_REASON_LENGTH);
      return reason === '' ? null : { status: 'failed', reason };
    }
    default:
      return null;
  }
}

/** Run the updater and always resolve with a checked result. */
export async function requestDesktopUpdate(updater: DesktopUpdater): Promise<DesktopUpdateResult> {
  let raw: unknown;
  try {
    raw = await updater();
  } catch (error) {
    // Main rejects a refused sender; its message is Electron's wrapper, not for display.
    console.error('desktop update request failed', error);
    return { status: 'failed', reason: BRIDGE_FAILURES.refused };
  }
  return parseUpdateResult(raw) ?? { status: 'failed', reason: BRIDGE_FAILURES.malformed };
}

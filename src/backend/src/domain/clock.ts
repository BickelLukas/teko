let _offsetMs = 0;
let _devMode = false;

export function initClock(cfg: { devMode: boolean; initialOffsetMs: number }): void {
  _devMode = cfg.devMode;
  _offsetMs = cfg.initialOffsetMs;
}

export function getNow(): Date {
  return new Date(Date.now() + _offsetMs);
}

export function getOffsetMs(): number {
  return _offsetMs;
}

export function setOffsetMs(ms: number): void {
  if (!_devMode) return;
  _offsetMs = ms;
}

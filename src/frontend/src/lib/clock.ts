let _offsetMs = 0;
const _listeners: Array<(offsetMs: number) => void> = [];

export function getNow(): Date {
  return new Date(Date.now() + _offsetMs);
}

export function getOffsetMs(): number {
  return _offsetMs;
}

export function setOffsetMs(ms: number): void {
  if (_offsetMs === ms) return;
  _offsetMs = ms;
  for (const cb of _listeners) cb(ms);
}

export function onClockOffsetChange(cb: (offsetMs: number) => void): () => void {
  _listeners.push(cb);
  return () => {
    const i = _listeners.indexOf(cb);
    if (i !== -1) _listeners.splice(i, 1);
  };
}

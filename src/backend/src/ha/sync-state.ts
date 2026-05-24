let _supervisorReachable = false;
let _lastUserSyncAt: Date | null = null;

export function updateSyncState(reachable: boolean, syncAt: Date | null): void {
  _supervisorReachable = reachable;
  if (syncAt) _lastUserSyncAt = syncAt;
}

export function getSyncState(): { supervisorReachable: boolean; lastUserSyncAt: Date | null } {
  return { supervisorReachable: _supervisorReachable, lastUserSyncAt: _lastUserSyncAt };
}

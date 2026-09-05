export const DB_READY_STATE = {
  DISCONNECTED: 0,
  CONNECTED: 1,
  CONNECTING: 2,
  DISCONNECTING: 3,
} as const;

export function isDbConnected(readyState: number): boolean {
  return readyState === DB_READY_STATE.CONNECTED;
}


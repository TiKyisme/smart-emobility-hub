// Unique identifiers for records created at runtime (reservations, requests, incidents).
export function createId(prefix) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

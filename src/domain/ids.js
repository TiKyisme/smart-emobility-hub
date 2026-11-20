// Readable, sequential identifiers (RSV-001, PRK-002, CHG-003, INC-004) for records created at
// runtime. Records are never removed from the in-memory lists, so "count + 1" stays unique.
export function nextId(prefix, records) {
  return `${prefix}-${String(records.length + 1).padStart(3, "0")}`;
}

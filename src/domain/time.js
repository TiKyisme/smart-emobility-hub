// Time helpers: timestamps, UC-09 one-hour charging time slots on local clock hours.
export const SLOT_MS = 60 * 60 * 1000;
// Team decision: private EV charging can be booked for today and tomorrow.
export const BOOKING_DAYS = 2;

export function toTimestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value === "") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function toIso(value) {
  return new Date(toTimestamp(value) ?? Date.now()).toISOString();
}

export function slotStartOf(timestamp) {
  const date = new Date(timestamp);
  date.setMinutes(0, 0, 0);
  return date.getTime();
}

export function dayStartOf(timestamp, dayOffset = 0) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  return date.getTime();
}

export function slotEndOf(slotStart) {
  return slotStart + SLOT_MS;
}

// A slot can be booked while it has not ended, if it starts on a full hour inside the booking window.
export function isBookableSlot(slotStart, now) {
  return slotStart === slotStartOf(slotStart)
    && slotEndOf(slotStart) > now
    && slotStart < dayStartOf(now, BOOKING_DAYS);
}

// Slots of one booking day (0 = today) that have not ended yet.
export function slotsOfDay(dayOffset, now) {
  const slots = [];
  for (let hour = 0; hour < 24; hour += 1) {
    const date = new Date(dayStartOf(now, dayOffset));
    date.setHours(hour);
    const start = date.getTime();
    if (isBookableSlot(start, now)) slots.push(start);
  }
  return slots;
}

export function bookableSlots(now) {
  return Array.from({ length: BOOKING_DAYS }, (_, day) => slotsOfDay(day, now)).flat();
}

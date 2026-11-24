/**
 * Provider contact for bookings. Customers talk to providers through Banjara chat;
 * the backend only reveals `providerPhone` for a confirmed booking from 24h before
 * the trip/stay until it ends, and sends `providerContactOpensAt` before that.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Asia/Karachi is a fixed UTC+5 offset (no DST). */
const KARACHI_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Formats an ISO instant as e.g. "Wed 12 Nov, 8:00 AM" in Pakistan time. */
export function formatContactOpensAt(iso?: string | null): string | undefined {
  if (!iso) return undefined;
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return undefined;
  const d = new Date(time + KARACHI_OFFSET_MS);
  const hours = d.getUTCHours();
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${hour12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
}

/** Dialable form of a booking-window provider phone, or undefined if none. */
export function dialablePhone(value?: string | null): string | undefined {
  const phone = value?.trim().replace(/[^\d+]/g, '');
  return phone ? phone : undefined;
}

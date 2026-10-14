/**
 * Safe date and time formatting utilities.
 * Handles missing, undefined, null, or invalid date strings gracefully without throwing or displaying 'Invalid Date'.
 */

export function formatSafeDate(
  dateStr?: string | null,
  options?: Intl.DateTimeFormatOptions,
  fallback = 'Unavailable'
): string {
  if (!dateStr || dateStr.trim() === '') return fallback;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return fallback;
    return d.toLocaleDateString(undefined, options);
  } catch {
    return fallback;
  }
}

export function formatSafeDateTime(
  dateStr?: string | null,
  options?: Intl.DateTimeFormatOptions,
  fallback = 'Unavailable'
): string {
  if (!dateStr || dateStr.trim() === '') return fallback;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return fallback;
    return d.toLocaleString(undefined, options);
  } catch {
    return fallback;
  }
}

export function formatSafeTime(
  dateStr?: string | null,
  options?: Intl.DateTimeFormatOptions,
  fallback = 'Unavailable'
): string {
  if (!dateStr || dateStr.trim() === '') return fallback;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return fallback;
    return d.toLocaleTimeString([], options);
  } catch {
    return fallback;
  }
}

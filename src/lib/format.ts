const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

export function formatINR(amount: number | string): string {
  const num = typeof amount === 'string' ? Number(amount) : amount;
  if (!isFinite(num)) return '₹0.00';
  return inrFormatter.format(num);
}

/**
 * Parse a date-only string (YYYY-MM-DD) as local date to avoid timezone off-by-one.
 * new Date("2026-03-12") is midnight UTC, which can show as previous day in some timezones.
 */
export function parseLocalDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const match = String(dateStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, y, m, d] = match;
  const year = parseInt(y!, 10);
  const month = parseInt(m!, 10) - 1;
  const day = parseInt(d!, 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  const date = new Date(year, month, day);
  return isNaN(date.getTime()) ? null : date;
}



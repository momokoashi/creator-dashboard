// ============================================================
// Formatting helpers — shared by UI and logic.
// Plain ESM so Node can run/test it with zero build tooling.
// ============================================================

/** Format a number compactly (12,300 -> "12.3K", 1_200_000 -> "1.2M"). */
export function formatNumber(n) {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return Number(n).toLocaleString();
}

/** Format money without cents ($5,000). */
export function formatMoney(n) {
  if (n == null || isNaN(n)) return '—';
  return '$' + Math.round(n).toLocaleString();
}

/** Format a CPM value ($42.50). Returns "—" when not computable. */
export function formatCpm(n) {
  if (n == null || isNaN(n) || !isFinite(n)) return '—';
  return '$' + Number(n).toFixed(2);
}

/**
 * Parse a loose numeric input: strips commas, understands K/M suffixes.
 * "1.2K" -> 1200, "3,450" -> 3450.
 */
export function parseNumberInput(val) {
  if (val == null || val === '' || val === '—') return 0;
  let s = String(val).replace(/,/g, '').trim();
  const suffix = s.match(/([KkMm])$/);
  let num = parseFloat(s);
  if (isNaN(num)) return 0;
  if (suffix) {
    const m = suffix[1].toUpperCase();
    if (m === 'K') num *= 1_000;
    if (m === 'M') num *= 1_000_000;
  }
  return num;
}

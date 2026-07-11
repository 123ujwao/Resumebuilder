/**
 * Build the label for a tailored version (Req 4.5).
 *
 * Format: `Tailored — <Company or "Job"> <YYYY-MM-DD>`, e.g.
 * `Tailored — Acme Corp 2024-06-01`. Using an ISO date keeps labels stable and
 * locale-independent (handy for tests and sorting).
 */
export function tailoredVersionLabel(company: string, date: Date): string {
  const who = company.trim() || 'Job';
  const day = date.toISOString().slice(0, 10);
  return `Tailored — ${who} ${day}`;
}

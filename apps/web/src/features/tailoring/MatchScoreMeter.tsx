/**
 * Match score display (Req 4.4).
 *
 * Renders the 0-100 `matchScore` as a labelled badge plus a horizontal meter so
 * it's always visible, never hidden. Colour bands give a quick read: red (<40),
 * amber (40-69), green (>=70).
 */
export interface MatchScoreMeterProps {
  score: number;
}

function bandClasses(score: number): { bar: string; badge: string } {
  if (score >= 70) {
    return { bar: 'bg-green-500', badge: 'bg-green-100 text-green-800' };
  }
  if (score >= 40) {
    return { bar: 'bg-amber-500', badge: 'bg-amber-100 text-amber-800' };
  }
  return { bar: 'bg-red-500', badge: 'bg-red-100 text-red-800' };
}

export function MatchScoreMeter({ score }: MatchScoreMeterProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const { bar, badge } = bandClasses(clamped);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">Match score</span>
        <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${badge}`}>
          {clamped}/100
        </span>
      </div>
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200"
        role="meter"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Resume match score"
      >
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

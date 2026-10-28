export interface Segment { label: string; value: number; color: string }

/** Pure-SVG donut chart (no library). */
export function Donut({ segments, size = 140, thickness = 18, center }: { segments: Segment[]; size?: number; thickness?: number; center?: { big: string; small: string } }) {
  const total = segments.reduce((n, s) => n + s.value, 0);
  const r = (size - thickness) / 2, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={segments.map((s) => `${s.label}: ${s.value}`).join("، ")}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ebede5" strokeWidth={thickness} />
      {total > 0 && segments.filter((s) => s.value > 0).map((s) => {
        const len = (s.value / total) * c;
        const el = <circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={thickness}
          strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} />;
        offset += len;
        return el;
      })}
      {center && (<>
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={size * 0.2} fontWeight="700" fill="#1f2120">{center.big}</text>
        <text x="50%" y={size * 0.64} textAnchor="middle" fontSize={size * 0.085} fill="#6b7157">{center.small}</text>
      </>)}
    </svg>
  );
}

export function Legend({ segments }: { segments: Segment[] }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {segments.map((s) => (
        <li key={s.label} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.label}<b className="mr-auto pr-3">{s.value}</b></li>
      ))}
    </ul>
  );
}

export function Bar({ value, max, tone = "brand" }: { value: number; max: number; tone?: "brand" | "gold" | "red" }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const color = tone === "red" ? "bg-red-600" : tone === "gold" ? "bg-gold" : "bg-brand";
  return (
    <div className="flex items-center gap-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-brand-light"><div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} /></div>
      <span className="w-10 text-left text-xs font-bold text-brand-mid">{pct}%</span>
    </div>
  );
}

export function StatCard({ label, value, icon, tone = "brand", children }: { label: string; value: string; icon: React.ReactNode; tone?: "brand" | "gold" | "red" | "green"; children?: React.ReactNode }) {
  const tones = { brand: "bg-brand-light text-brand", gold: "bg-gold-light text-gold-dark", red: "bg-red-50 text-red-700", green: "bg-emerald-50 text-emerald-700" };
  return (
    <div className="stat">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</div>
      <div className="min-w-0"><div className="text-xs font-bold text-brand-mid">{label}</div><div className="text-xl font-bold leading-tight">{value}</div>{children}</div>
    </div>
  );
}

export function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="flex flex-col items-center gap-2 px-4 py-8 text-sm text-brand-mid"><div className="text-brand-mid/60">{icon}</div>{text}</div>;
}

"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { IMPORT_FIELDS } from "@/import/fields";
import type { Mapping } from "@/import/engine";
import type { TripChoice } from "@/components/TripPicker";
import { listMappings, previewImport, reanalyzeSheet, runImport, saveMapping, uploadWorkbook, type CommitResult, type PreviewResult, type SheetSummary, type UploadResult } from "@/app/(app)/import/actions";

type Decision = "add" | "update" | "skip";

export function ImportWizard({ savedMappings, trips }: { savedMappings: { name: string; mapping: Mapping }[]; trips: TripChoice[] }) {
  const [tripId, setTripId] = useState("");
  const [up, setUp] = useState<UploadResult>({});
  const [sheets, setSheets] = useState<SheetSummary[]>([]);
  const [sheet, setSheet] = useState(0);
  const [mapping, setMapping] = useState<Mapping>({});
  const [prev, setPrev] = useState<PreviewResult | null>(null);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [defaultDecision, setDefaultDecision] = useState<Decision>("add");
  const [result, setResult] = useState<CommitResult | null>(null);
  const [saved, setSaved] = useState(savedMappings);
  const [mapName, setMapName] = useState("");
  const [pending, start] = useTransition();

  const cur = sheets[sheet];
  const use = (s: SheetSummary) => { setMapping(s.mapping); setPrev(null); };

  function onUpload(f: FormData) {
    if (!tripId) { setUp({ error: "اختر الرحلة أولاً" }); return; }
    start(async () => {
      const r = await uploadWorkbook({}, f);
      setUp(r); setPrev(null); setResult(null);
      if (r.sheets?.length) { setSheets(r.sheets); setSheet(r.best ?? 0); use(r.sheets[r.best ?? 0]); }
    });
  }
  const pick = (i: number) => { setSheet(i); use(sheets[i]); };
  const sourceBadge = (key: string) => {
    const s = cur?.sources[key];
    return s ? <span className={"chip ms-1 " + (s === "header" ? "chip-ok" : "chip-warn")}>{s === "header" ? "من العنوان" : "من المحتوى"}</span> : null;
  };

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <h2 className="font-bold">١. الرحلة والملف</h2>
        <div>
          <label className="label" htmlFor="import-trip">الرحلة التي سيُضاف إليها المعتمرون *</label>
          <select id="import-trip" className="input max-w-xl" value={tripId} onChange={(e) => { setTripId(e.target.value); setPrev(null); }}>
            <option value="">— اختر الرحلة —</option>
            {trips.map((t) => <option key={t.id} value={t.id}>{t.label} · {t.dates}</option>)}
          </select>
        </div>
        <form action={onUpload} className="flex flex-wrap items-center gap-2">
          <input type="file" name="file" accept=".xlsx" required />
          <button className="btn" disabled={pending}>رفع</button>
          <span className="text-xs text-brand-mid">xlsx فقط، حتى 5 ميغابايت و 5000 صف — يُقرأ أي ترتيب للأعمدة وأي صف عناوين</span>
        </form>
        {up.error && <p role="alert" className="text-sm font-bold text-red-700">{up.error}</p>}
      </section>

      {cur && up.key && (
        <section className="card space-y-3">
          <h2 className="font-bold">٢. الورقة والأعمدة</h2>
          <div className="flex flex-wrap items-center gap-2">
            <label className="label m-0" htmlFor="sheetsel">الورقة</label>
            <select id="sheetsel" className="input w-auto" value={sheet} onChange={(e) => pick(+e.target.value)}>
              {sheets.map((s, i) => <option key={s.name} value={i}>{s.name} ({s.rowCount} صف){s.ready ? "" : " — غير جاهزة"}</option>)}
            </select>
            <label className="label m-0" htmlFor="hdr">صف العناوين</label>
            <input id="hdr" type="number" min={0} className="input w-20" dir="ltr" key={cur.name + cur.headerRow} defaultValue={cur.headerRow}
              onBlur={(e) => { const n = +e.target.value; if (n !== cur.headerRow) start(async () => { const r = await reanalyzeSheet(up.key!, cur.name, n); if (r.sheet) { setSheets(sheets.map((s, i) => (i === sheet ? r.sheet! : s))); use(r.sheet); } }); }} />
            <span className="text-xs text-brand-mid">(0 = لا يوجد صف عناوين)</span>
            {saved.length > 0 && (
              <select className="input w-auto" defaultValue="" onChange={(e) => { const m = saved.find((x) => x.name === e.target.value); if (m) { setMapping(m.mapping); setPrev(null); } }}>
                <option value="">— ربط محفوظ —</option>{saved.map((m) => <option key={m.name}>{m.name}</option>)}
              </select>
            )}
          </div>
          {!cur.ready && <p className="alert-warn">لم أستطع تحديد رقم الجواز أو الاسم تلقائياً في هذه الورقة — اربطهما يدوياً أو جرّب ورقة/صف عناوين آخر.</p>}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {IMPORT_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="label" htmlFor={"map-" + f.key}>{f.label}{f.required && " *"}{sourceBadge(f.key)}</label>
                <select id={"map-" + f.key} className="input" value={mapping[f.key] ?? ""}
                  onChange={(e) => { setMapping({ ...mapping, [f.key]: e.target.value === "" ? null : +e.target.value }); setPrev(null); }}>
                  <option value="">— لا يوجد —</option>
                  {cur.headers.map((h, i) => <option key={i} value={i}>{h || `عمود ${i + 1}`}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input className="input w-48" placeholder="اسم لحفظ الربط" value={mapName} onChange={(e) => setMapName(e.target.value)} />
            <button type="button" className="btn-secondary" disabled={!mapName.trim()} onClick={() => start(async () => { await saveMapping(mapName, mapping); setSaved(await listMappings()); })}>حفظ الربط</button>
            <button type="button" className="btn" disabled={pending || !tripId} onClick={() => start(async () => { setResult(null); setPrev(await previewImport(up.key!, cur.name, cur.headerRow, mapping, tripId)); setDecisions({}); })}>معاينة وفحص</button>
            {!tripId && <span className="text-xs font-bold text-red-700">اختر الرحلة أولاً</span>}
          </div>
        </section>
      )}

      {prev?.error && <p role="alert" className="alert-bad">{prev.error}</p>}
      {prev?.preview && up.key && cur && (
        <section className="card space-y-3">
          <h2 className="font-bold">٣. المعاينة — الرحلة: {prev.preview.tripName}</h2>
          <p className="text-sm">
            صفوف المعتمرين: <b>{prev.preview.total}</b> · جديد: <b className="text-green-700">{prev.preview.fresh}</b> ·
            مسجّل مسبقاً: <b className="text-amber-700">{prev.preview.existing.length}</b> (منهم في هذه الرحلة: {prev.preview.existing.filter((e) => e.onTrip).length}) ·
            بأخطاء: <b className="text-red-700">{prev.preview.invalid.length}</b>
          </p>
          {prev.preview.sample.length > 0 && (
            <div className="overflow-auto rounded border">
              <table className="w-full"><thead><tr><th className="th">الصف</th><th className="th">الاسم</th><th className="th">الجواز</th><th className="th">الجنس</th><th className="th">الميلاد</th><th className="th">انتهاء الجواز</th><th className="th">الهاتف</th></tr></thead>
                <tbody>{prev.preview.sample.map((r) => <tr key={r.rowNo}><td className="td">{r.rowNo}</td><td className="td">{r.name}</td><td className="td ltr">{r.passportNo}</td><td className="td">{r.gender}</td><td className="td ltr">{r.birthDate}</td><td className="td ltr">{r.passportExpiry}</td><td className="td ltr">{r.phone}</td></tr>)}</tbody></table>
              <p className="p-2 text-xs text-brand-mid">عيّنة من أول {prev.preview.sample.length} معتمرين جدد بعد التطبيع.</p>
            </div>
          )}
          {prev.preview.notes.length > 0 && <p className="alert-warn">⚠ {prev.preview.notes.length} صف فيه قيم تم تجاهلها (مثل هاتف غير صالح) دون منع الاستيراد.</p>}
          {prev.preview.invalid.length > 0 && (
            <div className="max-h-64 overflow-auto rounded border">
              <table className="w-full"><thead><tr><th className="th">الصف</th><th className="th">الاسم</th><th className="th">المشكلة</th></tr></thead>
                <tbody>{prev.preview.invalid.map((r) => <tr key={r.rowNo}><td className="td">{r.rowNo}</td><td className="td">{r.name}</td><td className="td text-red-700">{r.errors.join(" | ")}</td></tr>)}</tbody></table>
            </div>
          )}
          {prev.preview.existing.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <b>المعتمرون المسجّلون مسبقاً:</b>
                <select className="input w-auto py-1" aria-label="الإجراء الافتراضي" value={defaultDecision} onChange={(e) => { setDefaultDecision(e.target.value as Decision); setDecisions({}); }}>
                  <option value="add">إضافتهم للرحلة بدون تغيير بياناتهم</option>
                  <option value="update">تحديث بياناتهم ثم إضافتهم</option>
                  <option value="skip">تخطّيهم</option>
                </select>
                <span className="text-xs text-brand-mid">من كان في الرحلة مسبقاً يُتخطّى تلقائياً.</span>
              </div>
              <div className="max-h-64 overflow-auto rounded border">
                <table className="w-full"><thead><tr><th className="th">الصف</th><th className="th">الجواز</th><th className="th">في الملف</th><th className="th">المسجّل حالياً</th><th className="th">الإجراء</th></tr></thead>
                  <tbody>{prev.preview.existing.map((r) => (
                    <tr key={r.rowNo}><td className="td">{r.rowNo}</td><td className="td ltr">{r.passportNo}</td><td className="td">{r.name}</td><td className="td">{r.existingName}{r.onTrip && <span className="chip chip-ok ms-2">في الرحلة</span>}</td>
                      <td className="td">{r.onTrip ? "—" : (
                        <select className="input py-1" value={decisions[r.rowNo] ?? defaultDecision} onChange={(e) => setDecisions({ ...decisions, [r.rowNo]: e.target.value as Decision })}>
                          <option value="add">إضافة للرحلة</option>{r.canUpdate && <option value="update">تحديث البيانات + إضافة</option>}<option value="skip">تخطّي</option></select>)}</td></tr>
                  ))}</tbody></table>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn" disabled={pending} onClick={() => start(async () => setResult(await runImport(up.key!, cur.name, cur.headerRow, mapping, tripId, decisions, defaultDecision)))}>تنفيذ الاستيراد</button>
            <span className="text-xs text-brand-mid">الصفوف السليمة فقط تُستورد داخل عملية واحدة؛ أي فشل يلغي الاستيراد كاملاً.</span>
          </div>
        </section>
      )}

      {result && (
        <section className="card" role="status">
          {result.error ? <p className="font-bold text-red-700">{result.error}</p> : (
            <>
              <h2 className="mb-1 font-bold text-green-800">تم الاستيراد</h2>
              <p className="text-sm">أُضيف: {result.created} · مسجّلون أُضيفوا للرحلة: {result.addedExisting} · حُدّث: {result.updated} · كانوا في الرحلة: {result.alreadyOnTrip} · تُخطّي: {result.skipped} · صفوف بأخطاء: {result.invalidCount}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {result.tripId && <Link className="btn" href={`/trips/${result.tripId}`}>فتح الرحلة</Link>}
                {result.reportKey && <a className="btn-secondary" href={`/api/import/${result.reportKey}/errors`}>تنزيل تقرير الأخطاء (Excel)</a>}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

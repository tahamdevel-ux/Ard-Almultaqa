"use client";
import { useState, useTransition } from "react";
import { IMPORT_FIELDS } from "@/import/fields";
import type { Mapping } from "@/import/engine";
import { listMappings, previewImport, runImport, saveMapping, uploadWorkbook, type CommitResult, type PreviewResult, type UploadResult } from "@/app/(app)/import/actions";

export function ImportWizard({ savedMappings }: { savedMappings: { name: string; mapping: Mapping }[] }) {
  const [up, setUp] = useState<UploadResult>({});
  const [sheet, setSheet] = useState(0);
  const [mapping, setMapping] = useState<Mapping>({});
  const [prev, setPrev] = useState<PreviewResult | null>(null);
  const [decisions, setDecisions] = useState<Record<number, "skip" | "update">>({});
  const [result, setResult] = useState<CommitResult | null>(null);
  const [saved, setSaved] = useState(savedMappings);
  const [mapName, setMapName] = useState("");
  const [pending, start] = useTransition();

  const sheets = up.sheets ?? [];
  const cur = sheets[sheet];

  function onUpload(f: FormData) {
    start(async () => {
      const r = await uploadWorkbook({}, f);
      setUp(r); setPrev(null); setResult(null);
      if (r.sheets?.length) { setSheet(0); setMapping(r.sheets[0].guess); }
    });
  }
  const pick = (i: number) => { setSheet(i); setMapping(sheets[i].guess); setPrev(null); };

  return (
    <div className="space-y-4">
      <section className="card">
        <h2 className="mb-2 font-bold">١. رفع الملف</h2>
        <form action={onUpload} className="flex flex-wrap items-center gap-2">
          <input type="file" name="file" accept=".xlsx" required />
          <button className="btn" disabled={pending}>رفع</button>
          <span className="text-xs text-brand-mid">xlsx فقط، حتى 5 ميغابايت و 5000 صف</span>
        </form>
        {up.error && <p role="alert" className="mt-2 text-sm font-bold text-red-700">{up.error}</p>}
      </section>

      {cur && up.key && (
        <section className="card space-y-3">
          <h2 className="font-bold">٢. اختيار الورقة وربط الأعمدة</h2>
          <div className="flex flex-wrap items-center gap-2">
            <label className="label m-0" htmlFor="sheetsel">الورقة</label>
            <select id="sheetsel" className="input w-auto" value={sheet} onChange={(e) => pick(+e.target.value)}>
              {sheets.map((s, i) => <option key={s.name} value={i}>{s.name} ({s.rowCount} صف)</option>)}
            </select>
            {saved.length > 0 && (
              <select className="input w-auto" defaultValue="" onChange={(e) => { const m = saved.find((x) => x.name === e.target.value); if (m) { setMapping(m.mapping); setPrev(null); } }}>
                <option value="">— ربط محفوظ —</option>{saved.map((m) => <option key={m.name}>{m.name}</option>)}
              </select>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {IMPORT_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="label" htmlFor={"map-" + f.key}>{f.label}{f.required && " *"}</label>
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
            <button type="button" className="btn" disabled={pending} onClick={() => start(async () => { setResult(null); setPrev(await previewImport(up.key!, cur.name, mapping)); setDecisions({}); })}>معاينة وفحص</button>
          </div>
        </section>
      )}

      {prev?.error && <p role="alert" className="alert-bad">{prev.error}</p>}
      {prev?.preview && up.key && cur && (
        <section className="card space-y-3">
          <h2 className="font-bold">٣. المعاينة</h2>
          <p className="text-sm">إجمالي الصفوف: <b>{prev.preview.total}</b> · جديد: <b className="text-green-700">{prev.preview.fresh}</b> · مكرر (موجود): <b className="text-amber-700">{prev.preview.duplicates.length}</b> · بأخطاء: <b className="text-red-700">{prev.preview.invalid.length}</b></p>
          {prev.preview.invalid.length > 0 && (
            <div className="max-h-64 overflow-auto rounded border">
              <table className="w-full"><thead><tr><th className="th">الصف</th><th className="th">الاسم</th><th className="th">المشكلة</th></tr></thead>
                <tbody>{prev.preview.invalid.map((r) => <tr key={r.rowNo}><td className="td">{r.rowNo}</td><td className="td">{r.name}</td><td className="td text-red-700">{r.errors.join(" | ")}</td></tr>)}</tbody></table>
            </div>
          )}
          {prev.preview.duplicates.length > 0 && (
            <div className="max-h-64 overflow-auto rounded border">
              <table className="w-full"><thead><tr><th className="th">الصف</th><th className="th">الجواز</th><th className="th">في الملف</th><th className="th">المسجّل حالياً</th><th className="th">الإجراء</th></tr></thead>
                <tbody>{prev.preview.duplicates.map((r) => (
                  <tr key={r.rowNo}><td className="td">{r.rowNo}</td><td className="td ltr">{r.passportNo}</td><td className="td">{r.name}</td><td className="td">{r.existingName}</td>
                    <td className="td"><select className="input py-1" value={decisions[r.rowNo] ?? "skip"} onChange={(e) => setDecisions({ ...decisions, [r.rowNo]: e.target.value as "skip" | "update" })}>
                      <option value="skip">تخطّي</option><option value="update">تحديث بيانات المعتمر</option></select></td></tr>
                ))}</tbody></table>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn" disabled={pending} onClick={() => start(async () => setResult(await runImport(up.key!, cur.name, mapping, decisions)))}>تنفيذ الاستيراد</button>
            <span className="text-xs text-brand-mid">الصفوف السليمة فقط تُستورد داخل عملية واحدة؛ أي فشل يلغي الاستيراد كاملاً.</span>
          </div>
        </section>
      )}

      {result && (
        <section className="card" role="status">
          {result.error ? <p className="font-bold text-red-700">{result.error}</p> : (
            <>
              <h2 className="mb-1 font-bold text-green-800">تم الاستيراد</h2>
              <p className="text-sm">أُضيف: {result.created} · حُدّث: {result.updated} · تُخطّي: {result.skipped} · صفوف بأخطاء: {result.invalidCount}</p>
              {result.reportKey && <a className="btn-secondary mt-2" href={`/api/import/${result.reportKey}/errors`}>تنزيل تقرير الأخطاء (Excel)</a>}
            </>
          )}
        </section>
      )}
    </div>
  );
}

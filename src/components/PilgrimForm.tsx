"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Field } from "./Field";
import { GOVERNORATES } from "@/lib/labels";
import type { ActionState } from "@/server/pilgrims";
import { TripPicker, type TripChoice } from "@/components/TripPicker";
import type { HotelOpt } from "@/components/AccommodationFields";
import { DigitsInput } from "@/components/DigitsInput";
import { DateInput } from "@/components/DateInput";

type V = Record<string, string | boolean | null | undefined>;

export function PilgrimForm({
  action, values = {}, agents, canHealth, redirectTo, trips, hotels,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  values?: V;
  agents: { id: string; name: string }[];
  canHealth: boolean;
  redirectTo?: boolean;
  trips?: TripChoice[];
  hotels?: HotelOpt[];
}) {
  const [state, formAction, pending] = useActionState(action, {} as ActionState);
  const router = useRouter();
  useEffect(() => {
    if (state.ok && redirectTo && state.id) router.push(`/pilgrims/${state.id}`);
    else if (state.ok) router.refresh();
  }, [state, redirectTo, router]);
  const fe = state.fieldErrors ?? {};
  const v = (k: string) => (values[k] ?? "") as string;
  const t = (name: string, label: string, opts: { dir?: "ltr"; required?: boolean; type?: string; hint?: string; upper?: boolean; date?: boolean; digits?: number } = {}) => (
    <Field label={label + (opts.required ? " *" : "")} name={name} error={fe[name]} hint={opts.hint}>
      {opts.digits ? (
        <DigitsInput id={name} name={name} defaultValue={v(name)} maxDigits={opts.digits} className={"input " + (fe[name] ? "border-red-500" : "")} />
      ) : opts.date ? (
        <DateInput id={name} name={name} defaultValue={v(name)} className={"input " + (fe[name] ? "border-red-500" : "")} />
      ) : (
        <input id={name} name={name} defaultValue={v(name)} type={opts.type ?? "text"} dir={opts.dir}
          className={"input " + (fe[name] ? "border-red-500" : "") + (opts.upper ? " uppercase" : "")}
          inputMode={opts.type === "tel" ? "tel" : undefined} />
      )}
    </Field>
  );
  return (
    <form action={formAction} className="space-y-6">
      {state.error && <p role="alert" className="alert-bad">{state.error}</p>}
      {state.ok && !redirectTo && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">تم الحفظ</p>}

      <section className="card">
        <h2 className="mb-3 font-bold">البيانات الشخصية (بالعربي)</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <Field label="الاسم الثلاثي *" name="fullNameAr" error={fe.fullNameAr ?? fe.firstName ?? fe.fatherName ?? fe.grandfatherName} hint="الاسم الأول واسم الأب واسم الجد في خانة واحدة">
              <input id="fullNameAr" name="fullNameAr" defaultValue={[v("firstName"), v("fatherName"), v("grandfatherName")].filter(Boolean).join(" ")} className={"input " + (fe.fullNameAr || fe.firstName ? "border-red-500" : "")} />
            </Field>
          </div>
          {t("familyName", "اللقب", { required: true })}
          {t("greatGrandfatherName", "اسم أبو الجد")}
          <Field label="الجنس *" name="gender" error={fe.gender}>
            <select id="gender" name="gender" defaultValue={v("gender")} className="input">
              <option value="">اختر</option><option value="MALE">ذكر</option><option value="FEMALE">أنثى</option>
            </select>
          </Field>
          {t("birthDate", "تاريخ الميلاد", { required: true, date: true, hint: "DD/MM/YYYY" })}
          {t("motherName", "اسم الأم")}
          <Field label="المحافظة" name="governorate">
            <select id="governorate" name="governorate" defaultValue={v("governorate")} className="input">
              <option value="">اختر</option>{GOVERNORATES.map((g) => <option key={g}>{g}</option>)}
            </select>
          </Field>
          {t("address", "العنوان")}
          {t("phone", "رقم الهاتف", { digits: 11, hint: "07XXXXXXXXX (11 رقماً)" })}
          {t("emergencyPhone", "هاتف الطوارئ", { dir: "ltr", type: "tel" })}
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3 font-bold">الجواز (كما هو مطبوع بالإنكليزية)</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {t("passportNo", "رقم الجواز", { required: true, dir: "ltr", upper: true })}
          {t("enGivenName", "Given name", { required: true, dir: "ltr", upper: true })}
          {t("enFatherName", "Father name", { dir: "ltr", upper: true })}
          {t("enGrandfatherName", "Grandfather name", { dir: "ltr", upper: true })}
          {t("enSurname", "Surname", { required: true, dir: "ltr", upper: true })}
          {t("nationality", "الجنسية", { dir: "ltr" })}
          {t("placeOfBirth", "محل الولادة")}
          {t("passportIssue", "تاريخ الإصدار", { date: true, hint: "DD/MM/YYYY" })}
          {t("passportExpiry", "تاريخ الانتهاء", { required: true, date: true, hint: "DD/MM/YYYY" })}
          {t("passportAuthority", "جهة الإصدار")}
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3 font-bold">الوكيل والمحرم</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="الوكيل" name="agentId">
            <select id="agentId" name="agentId" defaultValue={v("agentId")} className="input">
              <option value="">— بدون —</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          {t("mahramPassport", "رقم جواز المحرم", { dir: "ltr", upper: true, hint: "اختياري — يجب أن يكون المحرم مسجّلاً" })}
          {t("mahramRelation", "صلة المحرم", { hint: "اختياري — لا يوجد محرم لبعض المعتمرات وهذا طبيعي" })}
        </div>
      </section>

      {canHealth && (
        <section className="card">
          <h2 className="mb-3 font-bold">الحالة الصحية</h2>
          <div className="flex flex-wrap gap-4 text-sm">
            {([["chronicIllness", "مرض مزمن"], ["wheelchair", "كرسي متحرك"], ["elderly", "كبير سن"]] as const).map(([k, l]) => (
              <label key={k} className="flex items-center gap-2"><input type="checkbox" name={k} defaultChecked={!!values[k]} /> {l}</label>
            ))}
          </div>
          <div className="mt-3"><Field label="ملاحظات" name="healthNotes">
            <textarea id="healthNotes" name="healthNotes" defaultValue={v("healthNotes")} className="input" rows={2} />
          </Field></div>
        </section>
      )}

      {trips && (
        <section className="card">
          <h2 className="mb-3 font-bold">الرحلات * <span className="text-xs font-normal text-brand-mid">(اختر رحلة واحدة على الأقل)</span></h2>
          <TripPicker trips={trips} error={fe.tripIds} hotels={hotels} />
        </section>
      )}

      <button className="btn" disabled={pending}>{pending ? "جارٍ الحفظ…" : "حفظ"}</button>
    </form>
  );
}

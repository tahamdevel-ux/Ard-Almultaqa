"use client";
import { useActionState, useEffect } from "react";
import { withParam } from "@/lib/returnTo";
import { useRouter } from "next/navigation";
import { Field } from "./Field";
import { GOVERNORATES } from "@/lib/labels";
import type { ActionState } from "@/server/pilgrims";
import { TripPicker, type TripChoice } from "@/components/TripPicker";
import type { HotelOpt } from "@/components/AccommodationFields";
import { PassportInput, PhoneInput } from "@/components/PhoneInput";
import { DateInput } from "@/components/DateInput";

type V = Record<string, string | boolean | null | undefined>;

export function PilgrimForm({
  action, values = {}, agents, canHealth, trips, hotels, returnTo, initialTripIds,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  values?: V;
  agents: { id: string; name: string }[];
  canHealth: boolean;
  trips?: TripChoice[];
  /** internal path of the list as the user left it (already validated) */
  returnTo?: string | null;
  initialTripIds?: string[];
  hotels?: HotelOpt[];
}) {
  const [state, formAction, pending] = useActionState(action, {} as ActionState);
  const router = useRouter();
  useEffect(() => {
    if (!state.ok || !state.id) return;
    if (state.intent === "saveNew") {
      // a new empty form; the trips and the agent of this one stay selected
      const q = new URLSearchParams();
      if (returnTo) q.set("returnTo", returnTo);
      q.set("saved", state.id);
      const tr = state.values?.tripIds; const tl = Array.isArray(tr) ? tr : tr ? [tr] : [];
      if (tl.length) q.set("trips", tl.join(","));
      const ag = state.values?.agentId; if (typeof ag === "string" && ag) q.set("agent", ag);
      router.push(`/pilgrims/new?${q.toString()}`);
    } else router.push(withParam(returnTo ?? "/pilgrims", "saved", state.id));
  }, [state, returnTo, router]);
  const fe = state.fieldErrors ?? {};
  const echo = state.values; // typed values survive a failed save
  const v = (k: string) => ((echo ? (echo[k] as string | undefined) : undefined) ?? values[k] ?? "") as string;
  const checked = (k: string) => (echo ? echo[k] === "on" : !!values[k]);
  const t = (name: string, label: string, opts: { dir?: "ltr"; required?: boolean; type?: string; hint?: string; upper?: boolean; date?: boolean; kind?: "phone" | "passport" } = {}) => (
    <Field label={label + (opts.required ? " *" : "")} name={name} error={fe[name]} hint={opts.hint}>
      {opts.kind === "phone" ? (
        <PhoneInput id={name} name={name} defaultValue={v(name)} className={"input " + (fe[name] ? "border-red-500" : "")} />
      ) : opts.kind === "passport" ? (
        <PassportInput id={name} name={name} defaultValue={v(name)} className={"input uppercase " + (fe[name] ? "border-red-500" : "")} />
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

      <section className="card">
        <h2 className="mb-3 font-bold">البيانات الشخصية (بالعربي)</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <Field label="الاسم الثلاثي *" name="fullNameAr" error={fe.fullNameAr ?? fe.firstName ?? fe.fatherName ?? fe.grandfatherName} hint="الاسم الأول واسم الأب واسم الجد في خانة واحدة">
              <input id="fullNameAr" name="fullNameAr" defaultValue={echo ? v("fullNameAr") : [v("firstName"), v("fatherName"), v("grandfatherName")].filter(Boolean).join(" ")} className={"input " + (fe.fullNameAr || fe.firstName ? "border-red-500" : "")} />
            </Field>
          </div>
          {t("familyName", "اللقب", { required: true })}
          {t("greatGrandfatherName", "اسم أبو الجد")}
          <Field label="الجنس *" name="gender" error={fe.gender}>
            <select key={"gender" + v("gender")} id="gender" name="gender" defaultValue={v("gender")} className="input">
              <option value="">اختر</option><option value="MALE">ذكر</option><option value="FEMALE">أنثى</option>
            </select>
          </Field>
          {t("birthDate", "تاريخ الميلاد", { required: true, date: true, hint: "DD/MM/YYYY" })}
          {t("motherName", "اسم الأم")}
          <Field label="المحافظة" name="governorate">
            <select key={"governorate" + v("governorate")} id="governorate" name="governorate" defaultValue={v("governorate")} className="input">
              <option value="">اختر</option>{GOVERNORATES.map((g) => <option key={g}>{g}</option>)}
            </select>
          </Field>
          {t("address", "العنوان")}
          {t("phone", "رقم الهاتف", { kind: "phone", hint: "عراقي: 07XXXXXXXXX (11 رقم) · سعودي: 05XXXXXXXX (10 أرقام)" })}
          {t("emergencyPhone", "هاتف الطوارئ", { kind: "phone", hint: "عراقي 07… أو سعودي 05…" })}
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3 font-bold">الجواز (كما هو مطبوع بالإنكليزية)</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="نوع الجواز" name="passportType" error={fe.passportType}>
            <select key={"passportType" + v("passportType")} id="passportType" name="passportType" defaultValue={v("passportType") || "IRAQI"} className="input">
              <option value="IRAQI">عراقي</option><option value="FOREIGN">أجنبي</option>
            </select>
          </Field>
          {t("passportNo", "رقم الجواز", { required: true, kind: "passport", hint: "عراقي: حرف + 8 أرقام مثل A12345678" })}
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
            <select key={"agentId" + v("agentId")} id="agentId" name="agentId" defaultValue={v("agentId")} className="input">
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
              <label key={k} className="flex items-center gap-2"><input type="checkbox" name={k} defaultChecked={checked(k)} /> {l}</label>
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
          <TripPicker trips={trips} error={fe.tripIds} hotels={hotels} initial={echo ?? (initialTripIds?.length ? { tripIds: initialTripIds } : undefined)} />
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <button name="intent" value="save" className="btn" disabled={pending}>{pending ? "جارٍ الحفظ…" : "حفظ"}</button>
        <button name="intent" value="saveNew" className="btn-secondary" disabled={pending}>حفظ وإضافة جديد</button>
      </div>
    </form>
  );
}

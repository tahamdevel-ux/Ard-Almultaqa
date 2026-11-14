"use client";
import { useActionState, useEffect, useState } from "react";
import { withParam } from "@/lib/returnTo";
import { useRouter } from "next/navigation";
import { Field } from "./Field";
import type { ActionState } from "@/server/pilgrims";
import { TripPicker, type TripChoice } from "@/components/TripPicker";
import type { HotelOpt } from "@/components/AccommodationFields";
import { PassportInput, PhoneInput } from "@/components/PhoneInput";
import { passportMaxLength, type PassportType } from "@/domain/identity";
import { DateInput } from "@/components/DateInput";
import { suggestEnglishNames } from "@/domain/translit";

type V = Record<string, string | boolean | null | undefined>;

export function PilgrimForm({
  action, values = {}, agents, canHealth, trips, hotels, returnTo, initialKeep,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  values?: V;
  agents: { id: string; name: string }[];
  canHealth: boolean;
  trips?: TripChoice[];
  /** internal path of the list as the user left it (already validated) */
  returnTo?: string | null;
  /** shared choices kept from the previous pilgrim (trip, agent, hotel, room type, food, تصريف, head of family) */
  initialKeep?: Record<string, string | string[]>;
  hotels?: HotelOpt[];
}) {
  const [state, formAction, pending] = useActionState(action, {} as ActionState);
  const router = useRouter();
  const [anyHead, setAnyHead] = useState(false);
  useEffect(() => {
    if (!state.ok || !state.id) return;
    if (state.intent === "saveNew" || state.intent === "saveFamily") {
      // a new empty form that keeps the shared choices of this one; "saveFamily" also links the new pilgrim to the head just saved
      const q = new URLSearchParams();
      if (returnTo) q.set("returnTo", returnTo);
      q.set("saved", state.id);
      const keep: Record<string, string | string[]> = { ...(state.values ?? {}) };
      if (state.intent === "saveFamily") {
        for (const [tripId, bookingId] of Object.entries(state.bookingIds ?? {})) if (state.values?.[`isHead__${tripId}`] === "on") keep[`headOf__${tripId}`] = bookingId;
      } else {
        // after a plain save-and-new a head's family link is kept too (a family member being added stays linked)
        for (const k of Object.keys(state.values ?? {})) if (k.startsWith("headOf__")) keep[k] = (state.values ?? {})[k];
      }
      for (const k of Object.keys(keep)) if (k.startsWith("isHead__")) delete keep[k]; // the next pilgrim is not a head just because this one was
      q.set("keep", JSON.stringify(keep));
      router.push(`/pilgrims/new?${q.toString()}`);
    } else router.push(withParam(returnTo ?? "/pilgrims", "saved", state.id));
  }, [state, returnTo, router]);
  const fe = state.fieldErrors ?? {};
  /** Fills the EMPTY English name fields from the Arabic triple name (a suggestion to check against the passport). */
  function suggestEnglish() {
    const ar = (document.getElementById("fullNameAr") as HTMLInputElement | null)?.value ?? "";
    const sug = suggestEnglishNames(ar);
    for (const [id, val] of [["enGivenName", sug.given], ["enFatherName", sug.father], ["enGrandfatherName", sug.grandfather]] as const) {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (!el || el.value.trim() || !val) continue;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, val);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  const [ptype, setPtype] = useState<PassportType>(((values.passportType as string) === "FOREIGN" ? "FOREIGN" : "IRAQI"));
  const echo = state.values; // typed values survive a failed save
  const kept = initialKeep ?? {};
  const v = (k: string) => ((echo ? (echo[k] as string | undefined) : undefined) ?? (values[k] as string | undefined) ?? (typeof kept[k] === "string" ? (kept[k] as string) : undefined) ?? "") as string;
  const checked = (k: string) => (echo ? echo[k] === "on" : !!values[k]);
  const t = (name: string, label: string, opts: { dir?: "ltr"; required?: boolean; type?: string; hint?: string; upper?: boolean; date?: boolean; kind?: "phone" | "passport" } = {}) => (
    <Field label={label + (opts.required ? " *" : "")} name={name} error={fe[name]} hint={opts.hint}>
      {opts.kind === "phone" ? (
        <PhoneInput id={name} name={name} defaultValue={v(name)} className={"input " + (fe[name] ? "border-red-500" : "")} />
      ) : opts.kind === "passport" ? (
        <PassportInput id={name} name={name} defaultValue={v(name)} maxLength={passportMaxLength(ptype)} className={"input uppercase " + (fe[name] ? "border-red-500" : "")} />
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
    <form action={formAction} className="space-y-6" onKeyDown={(e) => {
      // Enter = "حفظ وإضافة جديد" (except in a notes box, where it is a new line, and on buttons / selects)
      const el = e.target as HTMLElement;
      if (e.key !== "Enter" || el.tagName !== "INPUT" || (el as HTMLInputElement).type === "checkbox") return;
      e.preventDefault();
      const btn = e.currentTarget.querySelector<HTMLButtonElement>("button[value=saveNew]");
      if (btn) e.currentTarget.requestSubmit(btn);
    }}>
      {state.error && <p role="alert" className="alert-bad">{state.error}</p>}
      <nav aria-label="أقسام النموذج" className="sticky top-14 z-10 -mx-1 flex gap-2 overflow-x-auto rounded-lg border border-line bg-white/95 px-2 py-1.5 text-sm shadow-sm backdrop-blur md:top-[3.75rem]">
        {[...(trips ? [["sec-trips", "الرحلة"]] : []), ["sec-personal", "البيانات الشخصية"], ["sec-passport", "الجواز"], ["sec-agent", "الوكيل والمحرم"], ...(canHealth ? [["sec-health", "الصحة"]] : [])].map(([id, l]) => (
          <a key={id} href={`#${id}`} className="whitespace-nowrap rounded-full px-3 py-1 font-bold text-brand-dark hover:bg-brand-light">{l}</a>
        ))}
      </nav>
      {trips && (
        <section id="sec-trips" className="card scroll-mt-32">
          <h2 className="mb-3 font-bold">الرحلات * <span className="text-xs font-normal text-brand-mid">(اختر رحلة واحدة على الأقل)</span></h2>
          <TripPicker trips={trips} error={fe.tripIds} hotels={hotels} initial={echo ?? initialKeep} onHeadChange={setAnyHead} />
        </section>
      )}


      <section id="sec-personal" className="card scroll-mt-32">
        <h2 className="mb-3 font-bold">البيانات الشخصية (بالعربي)</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <Field label="الاسم الثلاثي *" name="fullNameAr" error={fe.fullNameAr ?? fe.firstName ?? fe.fatherName ?? fe.grandfatherName} hint="الاسم الأول واسم الأب واسم الجد في خانة واحدة">
              <input id="fullNameAr" name="fullNameAr" defaultValue={echo ? v("fullNameAr") : [v("firstName"), v("fatherName"), v("grandfatherName")].filter(Boolean).join(" ")} className={"input " + (fe.fullNameAr || fe.firstName ? "border-red-500" : "")} />
            </Field>
          </div>
          <Field label="الجنس *" name="gender" error={fe.gender}>
            <select key={"gender" + v("gender")} id="gender" name="gender" defaultValue={v("gender")} className="input">
              <option value="">اختر</option><option value="MALE">ذكر</option><option value="FEMALE">أنثى</option>
            </select>
          </Field>
          {t("birthDate", "تاريخ الميلاد", { required: true, date: true, hint: "DD/MM/YYYY" })}
          {t("motherName", "اسم الأم", { required: true })}
          {t("phone", "رقم الهاتف", { kind: "phone", hint: "عراقي: 07XXXXXXXXX (11 رقم) · سعودي: 05XXXXXXXX (10 أرقام)" })}
        </div>
        <p className="mb-2 mt-4 border-t border-line pt-3 text-xs font-bold text-brand-mid">حقول اختيارية</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {t("familyName", "اللقب بالعربي")}
          {t("greatGrandfatherName", "اسم أبو الجد")}
          {t("address", "العنوان")}
          {t("emergencyPhone", "هاتف الطوارئ", { kind: "phone", hint: "عراقي 07… أو سعودي 05…" })}
        </div>
      </section>

      <section id="sec-passport" className="card scroll-mt-32">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">الجواز (كما هو مطبوع بالإنكليزية)</h2>
          <button type="button" className="btn-secondary text-xs" onClick={suggestEnglish} title="يملأ الخانات الفارغة فقط — راجعها مع الجواز">اقترح الاسم الإنكليزي من الاسم العربي</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="نوع الجواز" name="passportType" error={fe.passportType}>
            <select key={"passportType" + v("passportType")} id="passportType" name="passportType" defaultValue={v("passportType") || "IRAQI"} className="input" onChange={(e) => setPtype(e.target.value === "FOREIGN" ? "FOREIGN" : "IRAQI")}>
              <option value="IRAQI">عراقي</option><option value="FOREIGN">أجنبي</option>
            </select>
          </Field>
          {t("passportNo", "رقم الجواز", { required: true, kind: "passport", hint: "عراقي: حرف + 8 أرقام (9 خانات) · أجنبي: 6 إلى 12" })}
          {t("enGivenName", "Given name", { required: true, dir: "ltr", upper: true })}
          {t("enSurname", "Surname", { required: true, dir: "ltr", upper: true })}
          {t("passportExpiry", "تاريخ الانتهاء", { required: true, date: true, hint: "DD/MM/YYYY" })}
        </div>
        <p className="mb-2 mt-4 border-t border-line pt-3 text-xs font-bold text-brand-mid">حقول اختيارية</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {t("enFatherName", "Father name", { dir: "ltr", upper: true })}
          {t("enGrandfatherName", "Grandfather name", { dir: "ltr", upper: true })}
          {t("nationality", "الجنسية", { dir: "ltr" })}
          {t("placeOfBirth", "محل الولادة")}
          {t("passportIssue", "تاريخ الإصدار", { date: true, hint: "DD/MM/YYYY" })}
          {t("passportAuthority", "جهة الإصدار")}
        </div>
      </section>

      <section id="sec-agent" className="card scroll-mt-32">
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
        <section id="sec-health" className="card scroll-mt-32">
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

      <div className="flex flex-wrap gap-2">
        <button name="intent" value="save" className="btn" disabled={pending}>{pending ? "جارٍ الحفظ…" : "حفظ"}</button>
        <button name="intent" value="saveNew" className="btn-secondary" disabled={pending}>حفظ وإضافة جديد</button>
        {trips && anyHead && <button name="intent" value="saveFamily" className="btn-secondary" disabled={pending}>حفظ وإضافة فرد للعائلة</button>}
      </div>
    </form>
  );
}

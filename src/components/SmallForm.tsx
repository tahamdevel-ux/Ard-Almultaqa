"use client";
import { useActionState } from "react";
import { DateInput } from "@/components/DateInput";
import { PhoneInput } from "@/components/PhoneInput";
import type { TripActionState } from "@/app/(app)/trips/actions";

export type Field = { name: string; label: string; ltr?: boolean; type?: string; required?: boolean; placeholder?: string; defaultValue?: string; date?: boolean };

export function SmallForm({ action, fields, submit }: { action: (p: TripActionState, f: FormData) => Promise<TripActionState>; fields: Field[]; submit: string }) {
  const [state, formAction, pending] = useActionState(action, {} as TripActionState);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      {fields.map((f) => (
        <div key={f.name}>
          <label className="label" htmlFor={f.name + submit}>{f.label}</label>
          {f.date ? (
            <DateInput id={f.name + submit} name={f.name} required={f.required} placeholder={f.placeholder} defaultValue={f.defaultValue} className="input w-36" />
          ) : f.type === "tel" ? (
            <PhoneInput id={f.name + submit} name={f.name} placeholder={f.placeholder} defaultValue={f.defaultValue} className="input w-36" />
          ) : (
            <input id={f.name + submit} name={f.name} type={f.type ?? "text"} dir={f.ltr ? "ltr" : undefined} required={f.required}
              placeholder={f.placeholder} defaultValue={f.defaultValue} className="input w-36" />
          )}
        </div>
      ))}
      <button className="btn" disabled={pending}>{submit}</button>
      {state.error && <span role="alert" className="text-sm font-bold text-red-700">{state.error}</span>}
      {state.warning && <span role="status" className="text-sm font-bold text-amber-800">⚠ {state.warning}</span>}
    </form>
  );
}

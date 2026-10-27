"use client";
import { useActionState, type ReactNode } from "react";
import type { FormState } from "@/app/(app)/bookings/[id]/actions";

export function MoneyForm({ action, children, submit, danger }: { action: (p: FormState, f: FormData) => Promise<FormState>; children: ReactNode; submit: string; danger?: boolean }) {
  const [st, fa, pending] = useActionState(action, {} as FormState);
  return (
    <form action={fa} className="flex flex-wrap items-end gap-2">
      {children}
      <button className={danger ? "btn-danger" : "btn"} disabled={pending}>{submit}</button>
      {st.error && <span role="alert" className="text-sm font-bold text-red-700">{st.error}</span>}
      {st.ok && <span role="status" className="text-sm font-bold text-green-800">تم{st.receiptNo ? ` — وصل رقم ${st.receiptNo}` : ""}</span>}
    </form>
  );
}

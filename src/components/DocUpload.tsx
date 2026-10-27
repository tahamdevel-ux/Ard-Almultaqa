"use client";
import { useActionState } from "react";
import type { ActionState } from "@/server/pilgrims";

export function DocUpload({ action, label }: { action: (p: ActionState, f: FormData) => Promise<ActionState>; label: string }) {
  const [state, formAction, pending] = useActionState(action, {} as ActionState);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="file" name="file" accept="image/*,application/pdf" capture={undefined} className="text-sm" required />
      <button className="btn-secondary" disabled={pending}>{pending ? "جارٍ الرفع…" : label}</button>
      {state.error && <span role="alert" className="text-xs font-bold text-red-700">{state.error}</span>}
    </form>
  );
}

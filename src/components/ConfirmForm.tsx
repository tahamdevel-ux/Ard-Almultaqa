"use client";
import type { ReactNode } from "react";

/** A server-action form that asks first: nothing is sent unless the user confirms. */
export function ConfirmForm({ action, message, children, className }: { action: () => void | Promise<void>; message: string; children: ReactNode; className?: string }) {
  return (
    <form action={action} className={className} onSubmit={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>
      {children}
    </form>
  );
}

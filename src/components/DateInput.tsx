"use client";
import type { InputHTMLAttributes } from "react";
import { maskDateTyping, completeDate } from "@/domain/dateMask";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "inputMode" | "dir">;

// Text input for DD/MM/YYYY: the slash is added automatically while typing.
export function DateInput({ onChange, onBlur, placeholder, ...rest }: Props) {
  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      dir="ltr"
      autoComplete="off"
      placeholder={placeholder ?? "DD/MM/YYYY"}
      onChange={(e) => {
        const el = e.currentTarget;
        const before = el.value;
        const caret = el.selectionStart ?? before.length;
        const digitsBefore = before.slice(0, caret).replace(/[^0-9٠-٩۰-۹]/g, "").length;
        const masked = maskDateTyping(before);
        if (masked !== before) {
          el.value = masked;
          let pos = 0, seen = 0;
          while (pos < masked.length && seen < digitsBefore) {
            if (/\d/.test(masked[pos])) seen++;
            pos++;
          }
          if (caret >= before.length) pos = masked.length;
          el.setSelectionRange(pos, pos);
        }
        onChange?.(e);
      }}
      onBlur={(e) => {
        const done = completeDate(e.currentTarget.value);
        if (done !== e.currentTarget.value) e.currentTarget.value = done;
        onBlur?.(e);
      }}
    />
  );
}

"use client";
import type { InputHTMLAttributes } from "react";

const AR = "٠١٢٣٤٥٦٧٨٩", FA = "۰۱۲۳۴۵۶۷۸۹";

/** Digits only (Arabic digits become English) with a hard length limit. */
export function DigitsInput({ maxDigits, onChange, ...rest }: { maxDigits: number } & Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "inputMode" | "maxLength">) {
  return (
    <input
      {...rest}
      type="tel" inputMode="numeric" dir="ltr" autoComplete="off" maxLength={maxDigits}
      onChange={(e) => {
        const el = e.currentTarget;
        const clean = el.value.replace(/[٠-٩۰-۹]/g, (c) => String(AR.includes(c) ? AR.indexOf(c) : FA.indexOf(c))).replace(/\D/g, "").slice(0, maxDigits);
        if (clean !== el.value) el.value = clean;
        onChange?.(e);
      }}
    />
  );
}

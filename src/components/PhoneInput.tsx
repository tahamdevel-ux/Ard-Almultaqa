"use client";
import type { InputHTMLAttributes } from "react";

const AR = "٠١٢٣٤٥٦٧٨٩", FA = "۰۱۲۳۴۵۶۷۸۹";

/** Phone number box: opens the number keypad on phones, shows Arabic digits as English ones. Full validation is on the server. */
export function PhoneInput({ onChange, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "inputMode" | "dir">) {
  return (
    <input
      {...rest}
      type="tel" inputMode="tel" dir="ltr" autoComplete="off" maxLength={20}
      onChange={(e) => {
        const el = e.currentTarget;
        const clean = el.value.replace(/[٠-٩۰-۹]/g, (c) => String(AR.includes(c) ? AR.indexOf(c) : FA.indexOf(c)));
        if (clean !== el.value) el.value = clean;
        onChange?.(e);
      }}
    />
  );
}

/** Passport number box: letters are shown in uppercase as the user types; Arabic digits become English. */
export function PassportInput({ onChange, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "dir">) {
  return (
    <input
      {...rest}
      type="text" dir="ltr" autoComplete="off" autoCapitalize="characters" spellCheck={false}
      onChange={(e) => {
        const el = e.currentTarget;
        const clean = el.value.replace(/[٠-٩۰-۹]/g, (c) => String(AR.includes(c) ? AR.indexOf(c) : FA.indexOf(c))).toUpperCase();
        if (clean !== el.value) el.value = clean;
        onChange?.(e);
      }}
    />
  );
}

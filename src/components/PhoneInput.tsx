"use client";
import type { InputHTMLAttributes } from "react";
import { limitPhoneInput, limitPhoneList } from "@/domain/identity";

const AR = "٠١٢٣٤٥٦٧٨٩", FA = "۰۱۲۳۴۵۶۷۸۹";
const digitsFix = (v: string) => v.replace(/[٠-٩۰-۹]/g, (c) => String(AR.includes(c) ? AR.indexOf(c) : FA.indexOf(c)));

/**
 * Phone number box: number keypad on phones, Arabic digits shown as English, pasted values normalized (+964… -> 0…) and
 * the box never holds more than 11 digits. `multi` = several numbers in one box (each limited on its own).
 */
export function PhoneInput({ onChange, multi, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "inputMode" | "dir"> & { multi?: boolean }) {
  return (
    <input
      {...rest}
      type="tel" inputMode="tel" dir="ltr" autoComplete="off"
      onChange={(e) => {
        const el = e.currentTarget;
        const clean = multi ? limitPhoneList(digitsFix(el.value)) : limitPhoneInput(digitsFix(el.value));
        if (clean !== el.value) el.value = clean;
        onChange?.(e);
      }}
    />
  );
}

/** Passport number box: letters shown in uppercase while typing, Arabic digits become English, hard length limit (9 / 12). */
export function PassportInput({ onChange, maxLength, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "dir">) {
  return (
    <input
      {...rest}
      type="text" dir="ltr" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={maxLength}
      onChange={(e) => {
        const el = e.currentTarget;
        let clean = digitsFix(el.value).toUpperCase().replace(/\s+/g, "");
        if (maxLength) clean = clean.slice(0, maxLength);
        if (clean !== el.value) el.value = clean;
        onChange?.(e);
      }}
    />
  );
}

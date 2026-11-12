"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Makes a whole row / card clickable: any element with `data-href` opens its address when clicked anywhere on it. Clicks on
 * links, buttons, fields, forms, labels or while text is selected are left alone; ctrl/cmd-click opens a new tab.
 */
export function RowLinks() {
  const router = useRouter();
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const t = e.target as HTMLElement | null;
      const row = t?.closest<HTMLElement>("[data-href]");
      if (!row) return;
      const hit = t!.closest("a,button,input,select,textarea,label,summary,form,[role=button],[contenteditable]");
      if (hit && hit !== row && row.contains(hit)) return; // a control inside the row handles its own click
      if (window.getSelection()?.toString()) return;
      const href = row.dataset.href!;
      if (e.metaKey || e.ctrlKey) window.open(href, "_blank");
      else router.push(href);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [router]);
  return null;
}

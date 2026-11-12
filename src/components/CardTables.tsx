"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Tables marked `rt` turn into cards on phones (CSS in globals.css). The CSS shows each cell's column title via data-label,
 * so this component copies the header texts onto the cells (also after the page re-renders on the server).
 */
export function CardTables() {
  const path = usePathname();
  useEffect(() => {
    let raf = 0;
    const label = () => {
      document.querySelectorAll<HTMLTableElement>("table.rt").forEach((t) => {
        const heads = [...t.querySelectorAll<HTMLTableCellElement>("thead th")].map((h) => (h.textContent ?? "").replace(/[▲▼↕]/g, "").trim());
        t.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((tr) => {
          let col = 0;
          [...tr.children].forEach((c) => {
            const cell = c as HTMLTableCellElement;
            if (cell.tagName === "TD" && !cell.dataset.label && heads[col]) cell.dataset.label = heads[col];
            col += cell.colSpan || 1;
          });
        });
      });
    };
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(label); };
    label();
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { mo.disconnect(); cancelAnimationFrame(raf); };
  }, [path]);
  return null;
}

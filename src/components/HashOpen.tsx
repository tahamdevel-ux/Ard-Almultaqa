"use client";
import { useEffect } from "react";

/** Opens the <details id="..."> that the address points to (#settings), so a link can lead straight into a collapsed section. */
export function HashOpen() {
  useEffect(() => {
    const open = () => {
      const el = location.hash ? document.getElementById(location.hash.slice(1)) : null;
      if (el instanceof HTMLDetailsElement) { el.open = true; el.scrollIntoView({ block: "start" }); }
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}

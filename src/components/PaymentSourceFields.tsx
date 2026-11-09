"use client";
import { useState } from "react";

/** "مصدر الدفعة": direct from the pilgrim (default) or through an agent (agent required). Names: source, sourceAgentId. */
export function PaymentSourceFields({ agents, defaultAgentId }: { agents: { id: string; name: string }[]; defaultAgentId?: string | null }) {
  const [src, setSrc] = useState<"DIRECT" | "AGENT">("DIRECT");
  return (
    <>
      <div><label className="label" htmlFor="pay-source">مصدر الدفعة *</label>
        <select id="pay-source" name="source" value={src} onChange={(e) => setSrc(e.target.value as "DIRECT" | "AGENT")} className="input w-40">
          <option value="DIRECT">مباشر</option><option value="AGENT">عن طريق الوكيل</option>
        </select></div>
      {src === "AGENT" && (
        <div><label className="label" htmlFor="pay-agent">الوكيل *</label>
          <select id="pay-agent" name="sourceAgentId" required defaultValue={defaultAgentId ?? ""} className="input w-44">
            <option value="" disabled>اختر الوكيل</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select></div>
      )}
    </>
  );
}

import { requirePage } from "@/server/auth";
import { db } from "@/server/db";
import { ImportWizard } from "@/components/ImportWizard";
import type { Mapping } from "@/import/engine";

export default async function ImportPage() {
  await requirePage("import.run");
  const saved = (await db.importMapping.findMany({ orderBy: { name: "asc" } })).map((m) => ({ name: m.name, mapping: m.mapping as Mapping }));
  return (
    <div className="space-y-4">
      <h1 className="page-title">استيراد المعتمرين من Excel</h1>
      <ImportWizard savedMappings={saved} />
    </div>
  );
}

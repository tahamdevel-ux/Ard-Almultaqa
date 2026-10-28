import Link from "next/link";
import { Icon } from "@/components/icons";

export default function Forbidden() {
  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <div className="card text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-700"><Icon name="shield" size={24} /></div>
        <h1 className="mb-1 text-lg font-bold">غير مصرّح</h1>
        <p className="mb-5 text-sm text-brand-mid">ليست لديك صلاحية لفتح هذه الصفحة.</p>
        <Link href="/dashboard" className="btn">العودة للرئيسية</Link>
      </div>
    </main>
  );
}

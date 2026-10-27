import Link from "next/link";
export default function Forbidden() {
  return (
    <main className="mx-auto mt-16 max-w-sm px-4">
      <div className="card text-center">
        <h1 className="mb-2 text-lg font-bold text-red-800">غير مصرّح</h1>
        <p className="mb-4 text-sm">ليست لديك صلاحية لفتح هذه الصفحة.</p>
        <Link href="/dashboard" className="btn-secondary">العودة للرئيسية</Link>
      </div>
    </main>
  );
}

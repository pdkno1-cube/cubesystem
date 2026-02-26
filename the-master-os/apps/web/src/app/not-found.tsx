import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-4xl font-bold text-gray-900">404</h1>
      <p className="mt-2 text-gray-500">페이지를 찾을 수 없습니다</p>
      <Link
        href="/dashboard"
        className="mt-6 rounded-lg bg-brand-600 px-4 py-2 text-white hover:bg-brand-700 transition-colors"
      >
        대시보드로 돌아가기
      </Link>
    </div>
  );
}

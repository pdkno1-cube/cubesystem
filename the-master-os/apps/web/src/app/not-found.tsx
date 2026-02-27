import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
      <h1 className="text-6xl font-bold text-gray-300">404</h1>
      <h2 className="mt-4 text-xl font-semibold text-gray-900">페이지를 찾을 수 없습니다</h2>
      <p className="mt-2 text-gray-600">요청하신 페이지가 존재하지 않거나 이동되었습니다.</p>
      <Link
        href="/dashboard"
        className="mt-6 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        대시보드로 돌아가기
      </Link>
    </div>
  );
}

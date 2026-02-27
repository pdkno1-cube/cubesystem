export default function MarketingLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border border-gray-100 bg-gray-50" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-gray-100 bg-gray-50" />
    </div>
  );
}

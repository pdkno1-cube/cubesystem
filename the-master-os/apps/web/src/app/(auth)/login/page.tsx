import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="rounded-2xl bg-white p-8 shadow-lg">
      {/* Logo */}
      <div className="flex flex-col items-center">
        {/* Cube icon */}
        <div
          className="relative flex h-16 w-16 items-center justify-center rounded-2xl shadow-2xl ring-1 ring-white/20"
          style={{
            background:
              "linear-gradient(145deg, #818cf8 0%, #4f46e5 45%, #312e81 100%)",
          }}
        >
          {/* Inner highlight */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/20 to-transparent" />

          <svg
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="relative h-10 w-10"
          >
            <defs>
              <linearGradient id="lt" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="white" stopOpacity="1" />
                <stop offset="100%" stopColor="white" stopOpacity="0.82" />
              </linearGradient>
              <linearGradient id="lr" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="white" stopOpacity="0.68" />
                <stop offset="100%" stopColor="white" stopOpacity="0.32" />
              </linearGradient>
              <linearGradient id="ll" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="white" stopOpacity="0.38" />
                <stop offset="100%" stopColor="white" stopOpacity="0.12" />
              </linearGradient>
            </defs>
            {/* Top face */}
            <path d="M16 4L28 11V12L16 19L4 12V11L16 4Z" fill="url(#lt)" />
            {/* Left face */}
            <path d="M4 12L16 19V28L4 21V12Z" fill="url(#ll)" />
            {/* Right face */}
            <path d="M28 12V21L16 28V19L28 12Z" fill="url(#lr)" />
            {/* Outer edge */}
            <path
              d="M16 4L28 11V21L16 28L4 21V11L16 4Z"
              stroke="white"
              strokeWidth="0.6"
              strokeOpacity="0.45"
              strokeLinejoin="round"
              fill="none"
            />
            {/* Inner edges */}
            <path
              d="M16 19V28M4 12L16 19L28 12"
              stroke="white"
              strokeWidth="0.5"
              strokeOpacity="0.35"
            />
          </svg>
        </div>

        {/* Text */}
        <div className="mt-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-400">
            The
          </p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-gray-900">
            Master OS
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            1인 100에이전트 자율 경영 시스템
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="mt-8">
        <LoginForm />
      </div>
    </div>
  );
}

# Claude 2 Phase 0 작업 지시서 -- The Master OS 기반 구축 (경량 태스크)

> **실행자**: Claude 2 (경량/스캐폴딩 전담)
> **기간**: Phase 0 (2주) -- 2026.02.26 ~ 2026.03.12
> **선행 조건**: 없음 (독립 실행 가능)
> **보고 파일**: `PARALLEL/CLAUDE2_PHASE0_REPORT.md`

---

## 작업 규칙

1. 이 파일의 태스크를 **순서대로** 수행한다
2. 각 태스크 완료 시 `PARALLEL/CLAUDE2_PHASE0_REPORT.md`에 결과를 기록한다
3. 참조 문서:
   - `TEAM_G_DESIGN/architecture/DIR-STRUCTURE.md` -- 디렉토리 구조
   - `TEAM_G_DESIGN/architecture/TECH-DEPS.md` -- 패키지 버전
   - `TEAM_G_DESIGN/architecture/ENV-CONFIG.md` -- 환경변수
   - `TEAM_G_DESIGN/architecture/UI-PAGES.md` -- UI 페이지 구조
4. TypeScript strict 모드 필수, `any` 타입 금지
5. 모든 태스크 완료 후 REPORT 파일에 `## 완료 상태: DONE` 추가

---

## Task 1: Turborepo 모노레포 초기화

**목표**: `the-master-os/` 루트에 pnpm 워크스페이스 기반 Turborepo 모노레포를 생성한다.

### 실행 단계

```bash
# 1. 루트 디렉토리 생성
mkdir -p the-master-os
cd the-master-os

# 2. pnpm 초기화
pnpm init

# 3. Turborepo 설치
pnpm add -D turbo
```

### 생성할 파일

#### `the-master-os/package.json`

```json
{
  "name": "the-master-os",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "test": "turbo test",
    "type-check": "turbo type-check",
    "format": "prettier --write \"**/*.{ts,tsx,md,json}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,md,json}\""
  },
  "devDependencies": {
    "turbo": "^2.3",
    "prettier": "^3.4"
  },
  "packageManager": "pnpm@9.14.0",
  "engines": {
    "node": ">=20"
  }
}
```

#### `the-master-os/pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

#### `the-master-os/turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "globalEnv": [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_API_BASE_URL"
  ],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "type-check": {
      "dependsOn": ["^build"]
    }
  }
}
```

#### `the-master-os/.gitignore`

```text
# dependencies
node_modules
.pnpm-store

# next.js
.next/
out/

# turbo
.turbo

# env
.env
.env.local
.env.*.local

# python
__pycache__/
*.py[cod]
.venv/
venv/
*.egg-info/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# testing
coverage/

# misc
*.log
```

### 디렉토리 구조 생성

```bash
# 전체 디렉토리 골격 생성 (DIR-STRUCTURE.md 기준)
mkdir -p apps/web/public
mkdir -p apps/web/src/{app,components,hooks,stores,lib,types}
mkdir -p apps/web/src/app/\(auth\)/login
mkdir -p apps/web/src/app/\(dashboard\)/{dashboard,workspaces,agents,pipelines,billing,vault,audit-logs,settings}
mkdir -p apps/web/src/app/\(dashboard\)/workspaces/\[id\]
mkdir -p apps/web/src/app/api/auth
mkdir -p apps/web/src/app/api/proxy/\[...path\]
mkdir -p apps/web/src/components/{ui,dashboard,workspace,agent,pipeline,billing,vault,audit,layout}
mkdir -p apps/web/src/lib/supabase
mkdir -p apps/api/src/{routers,services,models,db/queries,mcp,security,middleware}
mkdir -p apps/api/tests
mkdir -p packages/shared/src/{types,constants}
mkdir -p langgraph/{workflows,agents,tools,tests}
mkdir -p supabase/{migrations,seed}
mkdir -p infra/{docker,cloudflare}
mkdir -p docs/{architecture,api}
mkdir -p .github/workflows
```

### 완료 기준

- [ ] `the-master-os/` 루트에 `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.gitignore` 존재
- [ ] DIR-STRUCTURE.md에 명시된 전체 디렉토리가 생성됨
- [ ] `pnpm install` 실행 시 에러 없음

---

## Task 2: Next.js 14 프로젝트 셋업

**목표**: `apps/web/`에 Next.js 14 App Router 프로젝트를 TypeScript strict 모드로 구성한다.

### 설치할 패키지 (TECH-DEPS.md 기준)

**dependencies**:

```text
next@^14.2
react@^18.3
react-dom@^18.3
@supabase/supabase-js@^2.47
@supabase/ssr@^0.5
@xyflow/react@^12.4
framer-motion@^11.15
tailwindcss@^3.4
@radix-ui/react-dialog@^1.1
@radix-ui/react-dropdown-menu@^1.1
@radix-ui/react-tabs@^1.1
@radix-ui/react-switch@^1.1
@radix-ui/react-toast@^1.1
lucide-react@^0.468
recharts@^2.15
@dnd-kit/core@^6.3
clsx@^2.1
tailwind-merge@^2.6
zustand@^5.0
@tanstack/react-query@^5.62
@tanstack/react-table@^8.20
react-hook-form@^7.54
zod@^3.24
@hookform/resolvers@^3.9
date-fns@^4.1
@sentry/nextjs@^8.45
```

**devDependencies**:

```text
typescript@^5.5
@types/react@^18.3
@types/node@^22.10
eslint@^9.16
eslint-config-next@^14.2
prettier@^3.4
vitest@^2.1
@testing-library/react@^16.1
autoprefixer@^10.4
postcss@^8.4
```

### Task 2 생성할 파일

#### `apps/web/package.json`

```json
{
  "name": "@masteros/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --ext .ts,.tsx",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "^14.2",
    "react": "^18.3",
    "react-dom": "^18.3",
    "@supabase/supabase-js": "^2.47",
    "@supabase/ssr": "^0.5",
    "@xyflow/react": "^12.4",
    "framer-motion": "^11.15",
    "@radix-ui/react-dialog": "^1.1",
    "@radix-ui/react-dropdown-menu": "^1.1",
    "@radix-ui/react-tabs": "^1.1",
    "@radix-ui/react-switch": "^1.1",
    "@radix-ui/react-toast": "^1.1",
    "lucide-react": "^0.468",
    "recharts": "^2.15",
    "@dnd-kit/core": "^6.3",
    "clsx": "^2.1",
    "tailwind-merge": "^2.6",
    "zustand": "^5.0",
    "@tanstack/react-query": "^5.62",
    "@tanstack/react-table": "^8.20",
    "react-hook-form": "^7.54",
    "zod": "^3.24",
    "@hookform/resolvers": "^3.9",
    "date-fns": "^4.1",
    "@sentry/nextjs": "^8.45"
  },
  "devDependencies": {
    "typescript": "^5.5",
    "@types/react": "^18.3",
    "@types/node": "^22.10",
    "eslint": "^9.16",
    "eslint-config-next": "^14.2",
    "vitest": "^2.1",
    "@testing-library/react": "^16.1",
    "tailwindcss": "^3.4",
    "autoprefixer": "^10.4",
    "postcss": "^8.4"
  }
}
```

#### `apps/web/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": false,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"],
      "@shared/*": ["../../packages/shared/src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

#### `apps/web/next.config.mjs`

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@masteros/shared"],
  experimental: {
    typedRoutes: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },
};

export default nextConfig;
```

#### `apps/web/tailwind.config.ts`

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f4ff",
          100: "#dbe4ff",
          200: "#bac8ff",
          300: "#91a7ff",
          400: "#748ffc",
          500: "#5c7cfa",
          600: "#4c6ef5",
          700: "#4263eb",
          800: "#3b5bdb",
          900: "#364fc7",
        },
        surface: {
          DEFAULT: "#ffffff",
          secondary: "#f8f9fa",
          tertiary: "#f1f3f5",
        },
        sidebar: {
          bg: "#1a1b1e",
          hover: "#25262b",
          active: "#2c2e33",
          text: "#c1c2c5",
          "text-active": "#ffffff",
        },
      },
      fontFamily: {
        sans: ["var(--font-pretendard)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "pulse-dot": "pulseDot 2s infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseDot: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
```

#### `apps/web/postcss.config.js`

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

#### `apps/web/src/app/layout.tsx`

-- 루트 레이아웃. 폰트, 메타데이터, 전역 프로바이더를 설정한다.

```tsx
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const pretendard = localFont({
  src: "../../public/fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Master OS",
  description: "1인 100에이전트 자율 경영 시스템",
  keywords: ["AI", "에이전트", "자율경영", "대시보드"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <body className="font-sans antialiased bg-surface text-gray-900">
        {children}
      </body>
    </html>
  );
}
```

#### `apps/web/src/app/globals.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 3.9%;
  }

  * {
    @apply border-gray-200;
  }

  body {
    @apply bg-surface text-gray-900;
  }
}

@layer utilities {
  .scrollbar-thin {
    scrollbar-width: thin;
    scrollbar-color: theme("colors.gray.300") transparent;
  }
}
```

#### `apps/web/src/app/not-found.tsx`

```tsx
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
```

### Task 2 완료 기준

- [ ] `apps/web/`에 Next.js 14 프로젝트가 정상 구성됨
- [ ] `pnpm dev --filter=web` 실행 시 localhost:3000 접근 가능
- [ ] TypeScript strict 모드 활성화 (`"strict": true`, `"noUncheckedIndexedAccess": true`)
- [ ] Tailwind CSS가 정상 작동 (globals.css에 @tailwind 지시어 존재)
- [ ] `pnpm type-check --filter=web` 에러 없음

---

## Task 3: UI 기본 레이아웃

**목표**: 사이드바 + 상단바 + 메인 콘텐츠 영역으로 구성된 대시보드 기본 레이아웃을 구현한다.

### Task 3 생성할 파일

#### `apps/web/src/components/layout/Sidebar.tsx`

좌측 고정 사이드바. 네비게이션 링크, 활성 상태 표시.

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  Building2,
  Bot,
  GitBranch,
  CreditCard,
  Shield,
  FileText,
  Settings,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/workspaces", label: "워크스페이스", icon: Building2 },
  { href: "/agents", label: "에이전트", icon: Bot },
  { href: "/pipelines", label: "파이프라인", icon: GitBranch },
  { href: "/billing", label: "크레딧", icon: CreditCard },
  { href: "/vault", label: "시크릿 볼트", icon: Shield },
  { href: "/audit-logs", label: "감사 로그", icon: FileText },
  { href: "/settings", label: "설정", icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col bg-sidebar-bg">
      {/* 로고 영역 */}
      <div className="flex h-16 items-center px-6">
        <span className="text-xl font-bold text-white">The Master OS</span>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-active text-sidebar-text-active"
                  : "text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-active",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* 하단 시스템 상태 */}
      <div className="border-t border-gray-700 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse-dot" />
          <span className="text-xs text-sidebar-text">시스템 정상</span>
        </div>
      </div>
    </aside>
  );
}
```

#### `apps/web/src/components/layout/Header.tsx`

상단 헤더바. 페이지 타이틀, 검색, 알림, 프로필.

```tsx
"use client";

import { Bell, Search, User } from "lucide-react";

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white/80 px-6 backdrop-blur-sm">
      {/* 좌측: 페이지 타이틀 */}
      <div>
        {title && (
          <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        )}
      </div>

      {/* 우측: 검색 + 알림 + 프로필 */}
      <div className="flex items-center gap-4">
        {/* 검색 */}
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500 hover:border-gray-300 transition-colors"
        >
          <Search className="h-4 w-4" />
          <span>검색...</span>
          <kbd className="ml-2 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-400">
            Ctrl+K
          </kbd>
        </button>

        {/* 알림 */}
        <button
          type="button"
          className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            3
          </span>
        </button>

        {/* 프로필 */}
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg p-2 text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white">
            <User className="h-4 w-4" />
          </div>
        </button>
      </div>
    </header>
  );
}
```

#### `apps/web/src/app/(dashboard)/layout.tsx`

대시보드 영역 공통 레이아웃. Sidebar + Header + 메인 콘텐츠.

```tsx
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* 사이드바 */}
      <Sidebar />

      {/* 메인 콘텐츠 영역 */}
      <div className="ml-64 flex flex-1 flex-col">
        <Header />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
```

#### `apps/web/src/app/(auth)/layout.tsx`

인증 페이지 레이아웃. 사이드바 없이 중앙 정렬.

```tsx
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
```

### Task 3 완료 기준

- [ ] `/dashboard` 접속 시 좌측 사이드바 + 상단 헤더 + 메인 콘텐츠 3-panel 레이아웃이 표시됨
- [ ] 사이드바 네비게이션 링크가 현재 경로에 따라 활성 상태 표시
- [ ] `/login` 접속 시 사이드바 없이 중앙 정렬 레이아웃 표시
- [ ] 반응형: 데스크톱(1280px+) 최적화

---

## Task 4: 라우팅 구조 생성

**목표**: UI-PAGES.md 기반으로 모든 페이지 파일(page.tsx)을 스켈레톤 형태로 생성한다.

### 생성할 파일 (9개 페이지)

모든 page.tsx는 아래 스켈레톤 패턴을 따른다:

```tsx
export default function [PageName]Page() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">[페이지 타이틀]</h2>
      <p className="mt-2 text-gray-500">[한 줄 설명]</p>
      {/* TODO: Phase 1~2에서 구현 */}
    </div>
  );
}
```

#### 1. `apps/web/src/app/(auth)/login/page.tsx`

```tsx
export default function LoginPage() {
  return (
    <div className="rounded-2xl bg-white p-8 shadow-lg">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">The Master OS</h1>
        <p className="mt-2 text-gray-500">1인 100에이전트 자율 경영 시스템</p>
      </div>
      {/* TODO: LoginForm + MFAVerification 컴포넌트 구현 */}
      <div className="mt-8 space-y-4">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-400">
          로그인 폼 구현 예정 (Phase 0 - Claude 1)
        </div>
      </div>
    </div>
  );
}
```

#### 2. `apps/web/src/app/(dashboard)/dashboard/page.tsx`

```tsx
export default function DashboardPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">God Mode Dashboard</h2>
      <p className="mt-2 text-gray-500">전체 법인 현황을 한 눈에 조감합니다</p>
      {/* TODO: GodModeCanvas, WorkspaceCard, GlobalKPIStrip, AlertFeed */}
    </div>
  );
}
```

#### 3. `apps/web/src/app/(dashboard)/workspaces/page.tsx`

```tsx
export default function WorkspacesPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">워크스페이스 관리</h2>
      <p className="mt-2 text-gray-500">
        법인 워크스페이스를 생성하고 관리합니다
      </p>
      {/* TODO: WorkspaceList, WorkspaceCreateModal */}
    </div>
  );
}
```

#### 4. `apps/web/src/app/(dashboard)/workspaces/[id]/page.tsx`

```tsx
interface WorkspaceDetailProps {
  params: { id: string };
}

export default function WorkspaceDetailPage({ params }: WorkspaceDetailProps) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">워크스페이스 상세</h2>
      <p className="mt-2 text-gray-500">워크스페이스 ID: {params.id}</p>
      {/* TODO: WorkspaceDetail, AssignedAgentGrid, PipelineStatusPanel */}
    </div>
  );
}
```

#### 5. `apps/web/src/app/(dashboard)/agents/page.tsx`

```tsx
export default function AgentsPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">에이전트 풀 관리</h2>
      <p className="mt-2 text-gray-500">
        에이전트를 조회하고 워크스페이스에 할당합니다
      </p>
      {/* TODO: AgentPoolSidebar, DragDropCanvas, AgentCard */}
    </div>
  );
}
```

#### 6. `apps/web/src/app/(dashboard)/pipelines/page.tsx`

```tsx
export default function PipelinesPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">파이프라인 모니터</h2>
      <p className="mt-2 text-gray-500">
        4대 핵심 파이프라인 실행 현황을 모니터링합니다
      </p>
      {/* TODO: PipelineOverview, PipelineStepTimeline, ExecutionLogPanel */}
    </div>
  );
}
```

#### 7. `apps/web/src/app/(dashboard)/billing/page.tsx`

```tsx
export default function BillingPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">크레딧 / 과금</h2>
      <p className="mt-2 text-gray-500">
        마스터 크레딧 사용량과 비용을 추적합니다
      </p>
      {/* TODO: CreditOverview, TokenUsageChart, CostBreakdownTable */}
    </div>
  );
}
```

#### 8. `apps/web/src/app/(dashboard)/vault/page.tsx`

```tsx
export default function VaultPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">시크릿 볼트</h2>
      <p className="mt-2 text-gray-500">
        API 키와 자격증명을 안전하게 관리합니다
      </p>
      {/* TODO: VaultKeyList, SecretCreateForm, KeyRotationSchedule */}
    </div>
  );
}
```

#### 9. `apps/web/src/app/(dashboard)/audit-logs/page.tsx`

```tsx
export default function AuditLogsPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">감사 로그</h2>
      <p className="mt-2 text-gray-500">시스템 전체 액션 이력을 조회합니다</p>
      {/* TODO: AuditLogTable, LogFilterBar, LogDetailDrawer */}
    </div>
  );
}
```

#### 10. `apps/web/src/app/(dashboard)/settings/page.tsx`

```tsx
export default function SettingsPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">설정</h2>
      <p className="mt-2 text-gray-500">시스템 전역 설정을 관리합니다</p>
      {/* TODO: SettingsTabs (일반, 보안, 알림, 연동) */}
    </div>
  );
}
```

### Task 4 완료 기준

- [ ] 9개 라우트 모두 브라우저에서 접근 가능 (404 없음)
- [ ] 각 페이지가 대시보드 레이아웃(사이드바+헤더) 안에서 렌더링됨
- [ ] 로그인 페이지만 AuthLayout(중앙 정렬) 사용
- [ ] TypeScript 컴파일 에러 없음

---

## Task 5: 린트 & 포맷 설정

**목표**: ESLint, Prettier, TypeScript strict 설정을 루트 및 apps/web에 구성한다.

### Task 5 생성할 파일

#### `the-master-os/.prettierrc`

```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 100,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

#### `the-master-os/.prettierignore`

```text
node_modules
.next
.turbo
dist
coverage
pnpm-lock.yaml
*.py
__pycache__
.venv
```

#### `apps/web/.eslintrc.json`

```json
{
  "extends": ["next/core-web-vitals", "next/typescript"],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_"
      }
    ],
    "no-console": ["warn", { "allow": ["warn", "error"] }],
    "prefer-const": "error",
    "no-var": "error",
    "eqeqeq": ["error", "always"],
    "curly": ["error", "all"],
    "react/jsx-no-leaked-render": ["error", { "validStrategies": ["ternary"] }],
    "react-hooks/exhaustive-deps": "warn"
  }
}
```

#### `apps/web/vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

#### `apps/web/src/test-setup.ts`

```typescript
import "@testing-library/jest-dom/vitest";
```

### Task 5 완료 기준

- [ ] `pnpm lint --filter=web` 실행 시 에러 없음 (경고는 허용)
- [ ] `pnpm format:check` 실행 시 모든 파일이 포맷 규칙 준수
- [ ] ESLint에서 `any` 타입 사용 시 에러 발생 확인
- [ ] ESLint에서 `console.log` 사용 시 경고 발생 확인

---

## Task 6: 환경변수 파일 생성

**목표**: ENV-CONFIG.md 기반으로 `.env.example`과 `.env.local.example` 파일을 생성한다.

### Task 6 생성할 파일

#### `the-master-os/.env.example`

```bash
# ============================================================
# The Master OS -- 환경변수 템플릿
# 이 파일을 .env.local로 복사하고 값을 채워 사용한다.
# cp .env.example .env.local
# ============================================================

# -- Supabase --
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
SUPABASE_JWT_SECRET=your-supabase-jwt-secret
SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:54322/postgres

# -- Next.js Public --
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_APP_NAME=The Master OS

# -- FastAPI --
API_HOST=0.0.0.0
API_PORT=8000
API_ENV=development
API_DEBUG=true
API_CORS_ORIGINS=http://localhost:3000
API_SECRET_KEY=change-this-to-random-secret-key
API_RATE_LIMIT_PER_MINUTE=100
API_WORKERS=4

# -- LangGraph / AI --
LANGGRAPH_WORKER_COUNT=4
LANGGRAPH_MAX_STEPS=50
LANGGRAPH_TIMEOUT_SECONDS=300
ANTHROPIC_API_KEY=your-anthropic-api-key
OPENAI_API_KEY=your-openai-api-key
DEFAULT_MODEL_OPUS=claude-opus-4-6
DEFAULT_MODEL_SONNET=claude-sonnet-4-6
DEFAULT_MODEL_HAIKU=claude-haiku-4-5-20251001

# -- 외부 서비스 API 키 --
FIRECRAWL_API_KEY=your-firecrawl-api-key
FIRECRAWL_BASE_URL=https://api.firecrawl.dev
PADDLEOCR_API_URL=http://localhost:8080
PADDLEOCR_SERVICE_TOKEN=
GOOGLE_SERVICE_ACCOUNT_JSON=base64-encoded-service-account-json
GOOGLE_DRIVE_ROOT_FOLDER_ID=your-google-drive-folder-id
FIGMA_API_KEY=your-figma-api-key
FIGMA_TEAM_ID=
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
SLACK_SIGNING_SECRET=your-slack-signing-secret
SLACK_WEBHOOK_URL=
SLACK_CHANNEL_ALERTS=your-alerts-channel-id
SLACK_CHANNEL_APPROVALS=your-approvals-channel-id
SLACK_CHANNEL_REPORTS=your-reports-channel-id

# -- 보안 --
VAULT_ENCRYPTION_KEY=base64-encoded-32-byte-aes-key
VAULT_KEY_ROTATION_DAYS=90
JWT_SECRET_KEY=your-jwt-secret-key
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7
MFA_ISSUER=TheMasterOS
MFA_ENABLED=true

# -- ChromaDB --
CHROMA_HOST=localhost
CHROMA_PORT=8001
CHROMA_COLLECTION_PREFIX=masteros_
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSION=1536

# -- 모니터링 --
SENTRY_DSN=
SENTRY_ENVIRONMENT=development
SENTRY_TRACES_SAMPLE_RATE=0.1
MIXPANEL_TOKEN=
MIXPANEL_API_SECRET=
LOG_LEVEL=INFO
LOG_FORMAT=json

# -- 인프라 --
CLOUDFLARE_TUNNEL_TOKEN=
CLOUDFLARE_TUNNEL_ID=
COMPOSE_PROJECT_NAME=the-master-os
```

#### `the-master-os/.env.local.example`

```bash
# ============================================================
# 로컬 개발 전용 환경변수 (이 파일을 .env.local로 복사)
# supabase start 실행 후 출력되는 키를 여기에 붙여넣는다
# ============================================================

# -- Supabase (supabase start 출력값 복사) --
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long

# -- Next.js (Supabase와 동일한 값 사용) --
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_APP_NAME=The Master OS

# -- FastAPI --
API_HOST=0.0.0.0
API_PORT=8000
API_ENV=development
API_DEBUG=true
API_CORS_ORIGINS=http://localhost:3000
API_SECRET_KEY=local-dev-secret-key-change-in-production

# -- AI (개인 키 입력) --
ANTHROPIC_API_KEY=sk-ant-your-key-here

# -- 보안 (로컬 개발용 임시 키) --
VAULT_ENCRYPTION_KEY=dGhpcy1pcy1hLWxvY2FsLWRldi1rZXktMzJieXRlcw==
JWT_SECRET_KEY=local-dev-jwt-secret-change-in-production
```

### Task 6 완료 기준

- [ ] `.env.example` 파일이 ENV-CONFIG.md의 모든 변수를 포함
- [ ] `.env.local.example` 파일이 로컬 개발에 필요한 최소 변수를 포함
- [ ] `.gitignore`에 `.env.local`이 포함되어 있음 (커밋 방지)
- [ ] 주석으로 각 섹션이 명확히 구분됨

---

## Task 7: 공유 패키지 셋업

**목표**: `packages/shared/`에 프론트엔드-백엔드 간 공유 TypeScript 타입 정의를 생성한다.

### Task 7 생성할 파일

#### `packages/shared/package.json`

```json
{
  "name": "@masteros/shared",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "type-check": "tsc --noEmit",
    "lint": "eslint . --ext .ts"
  },
  "devDependencies": {
    "typescript": "^5.5"
  }
}
```

#### `packages/shared/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

#### `packages/shared/src/index.ts`

```typescript
// The Master OS -- 공유 타입 & 상수

// Types
export type { User, UserRole } from "./types/workspace";
export type {
  Workspace,
  WorkspaceSettings,
  WorkspaceMember,
  WorkspaceMemberRole,
} from "./types/workspace";
export type {
  Agent,
  AgentCategory,
  AgentAssignment,
  AgentAssignmentStatus,
} from "./types/agent";
export type {
  Pipeline,
  PipelineCategory,
  PipelineExecution,
  PipelineExecutionStatus,
  PipelineStep,
  PipelineStepStatus,
} from "./types/pipeline";
export type {
  CreditTransaction,
  CreditTransactionType,
  CreditBalance,
} from "./types/billing";

// Constants
export {
  AGENT_CATEGORIES,
  PIPELINE_CATEGORIES,
  USER_ROLES,
  EXECUTION_STATUSES,
} from "./constants/index";
```

#### `packages/shared/src/types/workspace.ts`

```typescript
// 사용자 역할
export type UserRole = "owner" | "admin" | "member" | "viewer";

// 사용자
export interface User {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  role: UserRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

// 워크스페이스 설정
export interface WorkspaceSettings {
  timezone: string;
  language: string;
  max_agents: number;
}

// 워크스페이스
export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon_url: string | null;
  owner_id: string;
  is_active: boolean;
  settings: WorkspaceSettings;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// 워크스페이스 멤버 역할
export type WorkspaceMemberRole = "owner" | "admin" | "member" | "viewer";

// 워크스페이스 멤버
export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceMemberRole;
  invited_by: string | null;
  joined_at: string;
  created_at: string;
  updated_at: string;
}
```

#### `packages/shared/src/types/agent.ts`

```typescript
// 에이전트 카테고리
export type AgentCategory =
  | "planning"
  | "writing"
  | "marketing"
  | "audit"
  | "devops"
  | "ocr"
  | "scraping"
  | "analytics"
  | "finance"
  | "general";

// 에이전트 할당 상태
export type AgentAssignmentStatus = "idle" | "running" | "paused" | "error";

// 에이전트 모델 프로바이더
export type AgentModelProvider = "openai" | "anthropic" | "google" | "local";

// 에이전트 파라미터
export interface AgentParameters {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
}

// 에이전트
export interface Agent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  category: AgentCategory;
  model_provider: AgentModelProvider;
  model_name: string;
  system_prompt: string;
  parameters: AgentParameters;
  is_system: boolean;
  is_active: boolean;
  cost_per_run: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// 에이전트 할당
export interface AgentAssignment {
  id: string;
  agent_id: string;
  workspace_id: string;
  assigned_by: string;
  position_x: number | null;
  position_y: number | null;
  config_override: Record<string, unknown>;
  status: AgentAssignmentStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

#### `packages/shared/src/types/pipeline.ts`

```typescript
// 파이프라인 카테고리
export type PipelineCategory =
  | "grant_factory"
  | "document_verification"
  | "osmu_marketing"
  | "auto_healing"
  | "custom";

// 파이프라인 실행 상태
export type PipelineExecutionStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "paused";

// 파이프라인 단계 상태
export type PipelineStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "retrying";

// 파이프라인 그래프 정의
export interface PipelineGraphDefinition {
  nodes: Array<{
    id: string;
    type: string;
    label: string;
    agent_slug?: string;
  }>;
  edges: Array<{
    source: string;
    target: string;
    condition?: string;
  }>;
  entry_point: string;
}

// 파이프라인
export interface Pipeline {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: PipelineCategory;
  graph_definition: PipelineGraphDefinition;
  required_agents: string[];
  required_mcps: string[];
  is_system: boolean;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

// 파이프라인 실행
export interface PipelineExecution {
  id: string;
  pipeline_id: string;
  workspace_id: string;
  triggered_by: string;
  status: PipelineExecutionStatus;
  input_params: Record<string, unknown>;
  output_result: Record<string, unknown> | null;
  error_message: string | null;
  total_credits: number;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  created_at: string;
  updated_at: string;
}

// 파이프라인 단계
export interface PipelineStep {
  id: string;
  execution_id: string;
  step_name: string;
  step_order: number;
  agent_id: string | null;
  status: PipelineStepStatus;
  input_data: Record<string, unknown> | null;
  output_data: Record<string, unknown> | null;
  error_message: string | null;
  credits_used: number;
  retry_count: number;
  max_retries: number;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  created_at: string;
  updated_at: string;
}
```

#### `packages/shared/src/types/billing.ts`

```typescript
// 크레딧 거래 유형
export type CreditTransactionType =
  | "charge"
  | "usage"
  | "refund"
  | "bonus"
  | "adjustment";

// 크레딧 거래
export interface CreditTransaction {
  id: string;
  workspace_id: string;
  transaction_type: CreditTransactionType;
  amount: number;
  balance_after: number;
  description: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_by: string | null;
  created_at: string;
}

// 크레딧 잔액
export interface CreditBalance {
  workspace_id: string;
  balance: number;
  currency: "credits";
}
```

#### `packages/shared/src/constants/index.ts`

```typescript
// 에이전트 카테고리 상수
export const AGENT_CATEGORIES = [
  "planning",
  "writing",
  "marketing",
  "audit",
  "devops",
  "ocr",
  "scraping",
  "analytics",
  "finance",
  "general",
] as const;

// 에이전트 카테고리 한글 라벨
export const AGENT_CATEGORY_LABELS: Record<
  (typeof AGENT_CATEGORIES)[number],
  string
> = {
  planning: "기획",
  writing: "작문",
  marketing: "마케팅",
  audit: "감사",
  devops: "DevOps",
  ocr: "OCR",
  scraping: "스크래핑",
  analytics: "분석",
  finance: "재무",
  general: "범용",
};

// 파이프라인 카테고리 상수
export const PIPELINE_CATEGORIES = [
  "grant_factory",
  "document_verification",
  "osmu_marketing",
  "auto_healing",
  "custom",
] as const;

// 파이프라인 카테고리 한글 라벨
export const PIPELINE_CATEGORY_LABELS: Record<
  (typeof PIPELINE_CATEGORIES)[number],
  string
> = {
  grant_factory: "정부조달 입찰 팩토리",
  document_verification: "서류 자동 검증",
  osmu_marketing: "OSMU 마케팅 스웜",
  auto_healing: "AI 자율 유지보수",
  custom: "커스텀",
};

// 사용자 역할
export const USER_ROLES = ["owner", "admin", "member", "viewer"] as const;

// 실행 상태
export const EXECUTION_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
  "paused",
] as const;

// 실행 상태 한글 라벨
export const EXECUTION_STATUS_LABELS: Record<
  (typeof EXECUTION_STATUSES)[number],
  string
> = {
  pending: "대기",
  running: "실행중",
  completed: "완료",
  failed: "실패",
  cancelled: "취소",
  paused: "일시정지",
};
```

### Task 완료 기준

- [ ] `packages/shared/src/` 하위에 4개 타입 파일 + 1개 상수 파일 + 1개 인덱스 파일 존재
- [ ] `pnpm type-check --filter=@masteros/shared` 에러 없음
- [ ] `apps/web`에서 `import { Workspace } from "@shared/types/workspace"` 형태로 참조 가능
- [ ] 모든 타입이 ARCH-MASTEROS-v1.md의 DB 스키마와 1:1 대응

---

## 완료 후 체크리스트

모든 태스크 완료 후 아래를 확인한다:

1. [ ] `the-master-os/` 루트에서 `pnpm install` 성공
2. [ ] `pnpm dev --filter=web` 실행 시 localhost:3000 접근 가능
3. [ ] 모든 9개 라우트 (/login, /dashboard, /workspaces, /workspaces/:id, /agents, /pipelines, /billing, /vault, /audit-logs, /settings) 접근 가능
4. [ ] `pnpm lint --filter=web` 에러 없음
5. [ ] `pnpm type-check` (전체) 에러 없음
6. [ ] `.env.example` 파일 존재
7. [ ] `PARALLEL/CLAUDE2_PHASE0_REPORT.md`에 모든 태스크 결과 기록
8. [ ] REPORT 파일 마지막에 `## 완료 상태: DONE` 추가

---

버전: v1.0 | TEAM_G (ARCHITECT + PRD_MASTER) | Phase 0 경량 태스크 | 2026.02.26

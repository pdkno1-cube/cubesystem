# Claude 2 Phase 1 작업 지시서 -- The Master OS 코어 OS (경량 태스크)

> **실행자**: Claude 2 (경량/보조 전담)
> **기간**: Phase 1 (3주) -- 2026.03.13 ~ 2026.04.02
> **선행 조건**: Phase 0 완료 (모노레포 초기화, Next.js 셋업, 기본 레이아웃, 라우팅, 공유 타입)
> **보고 파일**: `PARALLEL/CLAUDE2_PHASE1_REPORT.md`
> **역할 분담**: Claude 1이 핵심 API(워크스페이스 CRUD + RLS, 에이전트 풀 관리, God Mode 대시보드)를 담당. Claude 2는 공통 UI 컴포넌트, 보조 페이지, BFF 라우트를 담당.

---

## 작업 규칙

1. 이 파일의 태스크를 **순서대로** 수행한다 (Task 1 완료 후 Task 2 진행)
2. 각 태스크 완료 시 `PARALLEL/CLAUDE2_PHASE1_REPORT.md`에 결과를 기록한다
3. 참조 문서:
   - `TEAM_G_DESIGN/prd/PRD-MASTEROS-v1.md` -- Phase 1 범위
   - `TEAM_G_DESIGN/architecture/UI-PAGES.md` -- 페이지별 컴포넌트
   - `TEAM_G_DESIGN/architecture/ARCH-MASTEROS-v1.md` -- API 명세 + DB 스키마
4. TypeScript strict 모드 필수, `any` 타입 금지
5. 모든 컴포넌트는 `cn()` 유틸리티(`@/lib/utils`)를 사용하여 className을 합성한다
6. 기존 `Button` 컴포넌트(`apps/web/src/components/ui/button.tsx`)의 패턴(forwardRef, variant/size props, cn 사용)을 따른다
7. Tailwind 스타일 가이드라인:
   - 색상: `brand-*` (주 컬러), `gray-*` (텍스트/보더), `surface-*` (배경)
   - 텍스트: `text-gray-900` (제목), `text-gray-700` (본문), `text-gray-500` (보조)
   - 보더: `border-gray-200` (기본), `rounded-lg` (8px), `rounded-xl` (12px)
   - 그림자: `shadow-sm` (카드), `shadow-lg` (모달/드롭다운)
   - 간격: `p-4` ~ `p-6` (카드 패딩), `gap-4` ~ `gap-6` (카드 간 간격)
   - 애니메이션: `transition-colors` (호버), `animate-fade-in` (진입)
8. console.log 단독 에러 처리 금지 -- 에러는 구조화된 Error 객체로 처리
9. 모든 태스크 완료 후 REPORT 파일에 `## 완료 상태: DONE` 추가

---

## Task 1: 공통 UI 컴포넌트 라이브러리 확장

**목표**: Phase 1 전체에서 사용할 재사용 가능한 UI 컴포넌트를 `apps/web/src/components/ui/` 디렉토리에 추가한다.

**기존 컴포넌트**: `button.tsx` (이미 존재)

### 1-1. `apps/web/src/components/ui/card.tsx`

카드 컨테이너 컴포넌트. header, content, footer 슬롯을 지원한다.

```tsx
import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// -- Card Root --
interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "outlined" | "elevated";
}

const CARD_VARIANTS = {
  default: "bg-white border border-gray-200 rounded-xl",
  outlined: "bg-transparent border border-gray-200 rounded-xl",
  elevated: "bg-white rounded-xl shadow-md",
} as const;

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <div ref={ref} className={cn(CARD_VARIANTS[variant], className)} {...props} />
  ),
);
Card.displayName = "Card";

// -- Card Header --
export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

// -- Card Title --
export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-lg font-semibold text-gray-900", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

// -- Card Description --
export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-gray-500", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

// -- Card Content --
export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

// -- Card Footer --
export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";
```

**완료 기준**:
- [ ] `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` 6개 서브 컴포넌트 export
- [ ] `variant` prop으로 `default`, `outlined`, `elevated` 3가지 스타일 전환
- [ ] 모든 컴포넌트가 `forwardRef`로 ref 전달 지원
- [ ] TypeScript 컴파일 에러 없음

---

### 1-2. `apps/web/src/components/ui/table.tsx`

@tanstack/react-table 기반 테이블 컴포넌트. 정렬, 페이지네이션 기본 지원.

```tsx
import { forwardRef, type HTMLAttributes, type ThHTMLAttributes, type TdHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// -- Table Root --
export const Table = forwardRef<HTMLTableElement, HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto">
      <table ref={ref} className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  ),
);
Table.displayName = "Table";

// -- Table Header --
export const TableHeader = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
  ),
);
TableHeader.displayName = "TableHeader";

// -- Table Body --
export const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  ),
);
TableBody.displayName = "TableBody";

// -- Table Footer --
export const TableFooter = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot
      ref={ref}
      className={cn("border-t bg-gray-50 font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  ),
);
TableFooter.displayName = "TableFooter";

// -- Table Row --
export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b border-gray-200 transition-colors hover:bg-gray-50 data-[state=selected]:bg-gray-100",
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

// -- Table Head Cell --
export const TableHead = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-10 px-4 text-left align-middle font-medium text-gray-500 [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = "TableHead";

// -- Table Data Cell --
export const TableCell = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn("px-4 py-3 align-middle text-gray-700 [&:has([role=checkbox])]:pr-0", className)}
      {...props}
    />
  ),
);
TableCell.displayName = "TableCell";

// -- Table Caption --
export const TableCaption = forwardRef<HTMLTableCaptionElement, HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn("mt-4 text-sm text-gray-500", className)} {...props} />
  ),
);
TableCaption.displayName = "TableCaption";
```

**완료 기준**:
- [ ] `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableRow`, `TableHead`, `TableCell`, `TableCaption` 8개 서브 컴포넌트 export
- [ ] 호버 시 행 하이라이트 (`hover:bg-gray-50`)
- [ ] 반응형 수평 스크롤 (`overflow-auto`)
- [ ] TypeScript 컴파일 에러 없음

---

### 1-3. `apps/web/src/components/ui/tabs.tsx`

@radix-ui/react-tabs 기반 탭 컴포넌트.

```tsx
"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

// -- Tabs Root --
export const Tabs = TabsPrimitive.Root;

// -- Tabs List --
export const TabsList = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-lg bg-gray-100 p-1 text-gray-500",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

// -- Tabs Trigger --
export const TabsTrigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5",
      "text-sm font-medium ring-offset-white transition-all",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
      "disabled:pointer-events-none disabled:opacity-50",
      "data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

// -- Tabs Content --
export const TabsContent = forwardRef<
  ElementRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-white",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;
```

**완료 기준**:
- [ ] `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` 4개 서브 컴포넌트 export
- [ ] 활성 탭에 `bg-white` + `shadow-sm` 스타일 적용
- [ ] 키보드 접근성 (Radix UI 기본 제공)
- [ ] TypeScript 컴파일 에러 없음

---

### 1-4. `apps/web/src/components/ui/toast.tsx`

토스트 알림 컴포넌트. 성공, 에러, 경고 3가지 variant를 지원한다.

```tsx
"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// -- Toast Provider (앱 루트에 1회 배치) --
export const ToastProvider = ToastPrimitive.Provider;

// -- Toast Viewport --
export const ToastViewport = forwardRef<
  ElementRef<typeof ToastPrimitive.Viewport>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport
    ref={ref}
    className={cn(
      "fixed top-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:right-0 sm:top-auto sm:bottom-0 sm:flex-col md:max-w-[420px]",
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitive.Viewport.displayName;

// -- Toast Variants --
const TOAST_VARIANTS = {
  success: "border-green-200 bg-green-50 text-green-900",
  error: "border-red-200 bg-red-50 text-red-900",
  warning: "border-yellow-200 bg-yellow-50 text-yellow-900",
  default: "border-gray-200 bg-white text-gray-900",
} as const;

type ToastVariant = keyof typeof TOAST_VARIANTS;

// -- Toast Root --
interface ToastProps extends ComponentPropsWithoutRef<typeof ToastPrimitive.Root> {
  variant?: ToastVariant;
}

export const Toast = forwardRef<ElementRef<typeof ToastPrimitive.Root>, ToastProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <ToastPrimitive.Root
      ref={ref}
      className={cn(
        "group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-lg border p-4 shadow-lg transition-all",
        "data-[swipe=cancel]:translate-x-0",
        "data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]",
        "data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]",
        "data-[state=open]:animate-fade-in",
        "data-[state=closed]:animate-fade-in",
        TOAST_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  ),
);
Toast.displayName = ToastPrimitive.Root.displayName;

// -- Toast Title --
export const ToastTitle = forwardRef<
  ElementRef<typeof ToastPrimitive.Title>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Title
    ref={ref}
    className={cn("text-sm font-semibold", className)}
    {...props}
  />
));
ToastTitle.displayName = ToastPrimitive.Title.displayName;

// -- Toast Description --
export const ToastDescription = forwardRef<
  ElementRef<typeof ToastPrimitive.Description>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Description
    ref={ref}
    className={cn("text-sm opacity-90", className)}
    {...props}
  />
));
ToastDescription.displayName = ToastPrimitive.Description.displayName;

// -- Toast Close --
export const ToastClose = forwardRef<
  ElementRef<typeof ToastPrimitive.Close>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Close
    ref={ref}
    className={cn(
      "absolute right-2 top-2 rounded-md p-1 opacity-0 transition-opacity",
      "hover:opacity-100 focus:opacity-100 group-hover:opacity-100",
      "focus:outline-none focus:ring-2 focus:ring-brand-500",
      className,
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" />
  </ToastPrimitive.Close>
));
ToastClose.displayName = ToastPrimitive.Close.displayName;

// -- Toast Action --
export const ToastAction = forwardRef<
  ElementRef<typeof ToastPrimitive.Action>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Action
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3",
      "text-sm font-medium ring-offset-white transition-colors",
      "hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2",
      "disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitive.Action.displayName;
```

**추가 필요**: `apps/web/src/hooks/use-toast.ts` -- 토스트 상태를 관리하는 커스텀 훅

```tsx
"use client";

import { useState, useCallback } from "react";

type ToastVariant = "default" | "success" | "error" | "warning";

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback(
    ({ title, description, variant = "default" }: Omit<ToastItem, "id">) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, title, description, variant }]);

      // 5초 후 자동 제거
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);

      return id;
    },
    [],
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, toast, dismiss };
}
```

**완료 기준**:
- [ ] `Toast`, `ToastProvider`, `ToastViewport`, `ToastTitle`, `ToastDescription`, `ToastClose`, `ToastAction` export
- [ ] `useToast` 훅이 `toast()` 호출 시 자동 5초 후 제거
- [ ] `variant`: `success`(녹색), `error`(빨간색), `warning`(노란색), `default`(흰색)
- [ ] TypeScript 컴파일 에러 없음

---

### 1-5. `apps/web/src/components/ui/dropdown-menu.tsx`

@radix-ui/react-dropdown-menu 기반 드롭다운 메뉴 컴포넌트.

```tsx
"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

// -- Content --
export const DropdownMenuContent = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 min-w-[8rem] overflow-hidden rounded-lg border border-gray-200 bg-white p-1 shadow-lg",
        "data-[state=open]:animate-fade-in",
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

// -- Item --
export const DropdownMenuItem = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Item>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { inset?: boolean }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-md px-2 py-1.5 text-sm text-gray-700 outline-none transition-colors",
      "focus:bg-gray-100 focus:text-gray-900",
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      inset ? "pl-8" : "",
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

// -- Checkbox Item --
export const DropdownMenuCheckboxItem = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-md py-1.5 pl-8 pr-2 text-sm text-gray-700 outline-none transition-colors",
      "focus:bg-gray-100 focus:text-gray-900",
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName = DropdownMenuPrimitive.CheckboxItem.displayName;

// -- Radio Item --
export const DropdownMenuRadioItem = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-md py-1.5 pl-8 pr-2 text-sm text-gray-700 outline-none transition-colors",
      "focus:bg-gray-100 focus:text-gray-900",
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Circle className="h-2 w-2 fill-current" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
));
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;

// -- Label --
export const DropdownMenuLabel = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Label>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn("px-2 py-1.5 text-sm font-semibold text-gray-900", inset ? "pl-8" : "", className)}
    {...props}
  />
));
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

// -- Separator --
export const DropdownMenuSeparator = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-gray-200", className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

// -- Shortcut --
export function DropdownMenuShortcut({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("ml-auto text-xs tracking-widest text-gray-400", className)} {...props} />
  );
}
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

// -- Sub Trigger --
export const DropdownMenuSubTrigger = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & { inset?: boolean }
>(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      "flex cursor-default select-none items-center rounded-md px-2 py-1.5 text-sm text-gray-700 outline-none",
      "focus:bg-gray-100",
      "data-[state=open]:bg-gray-100",
      inset ? "pl-8" : "",
      className,
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto h-4 w-4" />
  </DropdownMenuPrimitive.SubTrigger>
));
DropdownMenuSubTrigger.displayName = DropdownMenuPrimitive.SubTrigger.displayName;

// -- Sub Content --
export const DropdownMenuSubContent = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    className={cn(
      "z-50 min-w-[8rem] overflow-hidden rounded-lg border border-gray-200 bg-white p-1 shadow-lg",
      "data-[state=open]:animate-fade-in",
      className,
    )}
    {...props}
  />
));
DropdownMenuSubContent.displayName = DropdownMenuPrimitive.SubContent.displayName;
```

**완료 기준**:
- [ ] Radix UI DropdownMenu의 모든 서브 컴포넌트를 스타일링하여 re-export
- [ ] 포커스 시 `bg-gray-100` 하이라이트
- [ ] 키보드 접근성 (Radix UI 기본 제공)
- [ ] TypeScript 컴파일 에러 없음

---

### 1-6. `apps/web/src/components/ui/avatar.tsx`

아바타 컴포넌트. 이미지 + 이니셜 폴백.

```tsx
"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";

// -- Avatar Root --
const SIZE_CLASSES = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-lg",
} as const;

type AvatarSize = keyof typeof SIZE_CLASSES;

interface AvatarProps extends ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> {
  size?: AvatarSize;
}

export const Avatar = forwardRef<ElementRef<typeof AvatarPrimitive.Root>, AvatarProps>(
  ({ className, size = "md", ...props }, ref) => (
    <AvatarPrimitive.Root
      ref={ref}
      className={cn(
        "relative flex shrink-0 overflow-hidden rounded-full",
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    />
  ),
);
Avatar.displayName = AvatarPrimitive.Root.displayName;

// -- Avatar Image --
export const AvatarImage = forwardRef<
  ElementRef<typeof AvatarPrimitive.Image>,
  ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn("aspect-square h-full w-full object-cover", className)}
    {...props}
  />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

// -- Avatar Fallback (이니셜 표시) --
export const AvatarFallback = forwardRef<
  ElementRef<typeof AvatarPrimitive.Fallback>,
  ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-brand-100 font-medium text-brand-700",
      className,
    )}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;
```

**참고**: `@radix-ui/react-avatar` 패키지를 추가 설치해야 한다.
```bash
pnpm add @radix-ui/react-avatar --filter=web
```

**완료 기준**:
- [ ] `Avatar`, `AvatarImage`, `AvatarFallback` 3개 서브 컴포넌트 export
- [ ] `size` prop으로 `sm`(32px), `md`(40px), `lg`(48px), `xl`(64px) 전환
- [ ] 이미지 로드 실패 시 이니셜 폴백 자동 표시
- [ ] TypeScript 컴파일 에러 없음

---

### 1-7. `apps/web/src/components/ui/skeleton.tsx`

로딩 스켈레톤 컴포넌트.

```tsx
import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 원형 스켈레톤 여부 (아바타 등) */
  circle?: boolean;
}

export function Skeleton({ className, circle = false, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse bg-gray-200",
        circle ? "rounded-full" : "rounded-lg",
        className,
      )}
      {...props}
    />
  );
}
```

**완료 기준**:
- [ ] `Skeleton` 컴포넌트 export
- [ ] `circle` prop으로 원형/사각형 전환
- [ ] `animate-pulse` 애니메이션 적용
- [ ] 외부에서 `className`으로 width/height 커스텀 가능
- [ ] TypeScript 컴파일 에러 없음

---

### 1-8. `apps/web/src/components/ui/empty-state.tsx`

빈 상태 컴포넌트. 아이콘 + 메시지 + CTA 버튼.

```tsx
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  children?: ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  children,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 text-center",
        className,
      )}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
        <Icon className="h-8 w-8 text-gray-400" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-gray-900">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-gray-500">{description}</p>
      {action ? (
        <Button className="mt-6" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
      {children ? <div className="mt-6">{children}</div> : null}
    </div>
  );
}
```

**완료 기준**:
- [ ] `EmptyState` 컴포넌트 export
- [ ] `icon`, `title`, `description` 필수 props
- [ ] `action` prop 전달 시 CTA 버튼 렌더링
- [ ] `children`으로 커스텀 콘텐츠 삽입 가능
- [ ] TypeScript 컴파일 에러 없음

---

### Task 1 최종 체크리스트

- [ ] `apps/web/src/components/ui/` 디렉토리에 8개 파일 존재: `card.tsx`, `table.tsx`, `tabs.tsx`, `toast.tsx`, `dropdown-menu.tsx`, `avatar.tsx`, `skeleton.tsx`, `empty-state.tsx`
- [ ] `apps/web/src/hooks/use-toast.ts` 존재
- [ ] 추가 패키지 설치: `pnpm add @radix-ui/react-avatar --filter=web`
- [ ] `pnpm type-check --filter=web` 에러 없음
- [ ] 모든 컴포넌트가 기존 `button.tsx`와 동일한 패턴(forwardRef, cn, variant props) 준수

---

## Task 2: 파이프라인 목록 페이지 (기본)

**목표**: 4대 핵심 파이프라인을 카드 목록으로 보여주는 기본 페이지를 구현한다. 아직 실행 기능은 없으며 (Phase 2), 목록 조회만 수행한다.

### 2-1. BFF API 라우트: `apps/web/src/app/api/pipelines/route.ts`

GET /api/pipelines -- 파이프라인 목록 조회. 현재는 mock 데이터를 반환하고 Phase 2에서 Supabase 연동으로 전환한다.

```typescript
import { NextResponse } from "next/server";

// Phase 2에서 Supabase 연동으로 교체
// import { createClient } from "@/lib/supabase/server";

interface PipelineSummary {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: "grant_factory" | "document_verification" | "osmu_marketing" | "auto_healing";
  total_executions: number;
  last_executed_at: string | null;
  status: "active" | "inactive" | "error";
  is_system: boolean;
}

interface PipelinesResponse {
  data: PipelineSummary[];
  total: number;
}

const MOCK_PIPELINES: PipelineSummary[] = [
  {
    id: "pip-001",
    name: "정부조달 입찰 팩토리",
    slug: "grant-factory",
    description:
      "나라장터 등 조달 사이트에서 입찰 공고를 자동 수집하고, 자격 대조, 다중 페르소나 논리 검증, 제안서 초안 작성, OCR 서류 검수까지 일괄 수행합니다.",
    category: "grant_factory",
    total_executions: 0,
    last_executed_at: null,
    status: "inactive",
    is_system: true,
  },
  {
    id: "pip-002",
    name: "서류 자동 검증 시스템",
    slug: "document-verification",
    description:
      "행정/B2B 서류의 누락 확인, 위변조 감지, 날짜 판독(OCR), 데이터 양식 검사를 자동 수행하고 Google Drive에 분류 저장합니다.",
    category: "document_verification",
    total_executions: 0,
    last_executed_at: null,
    status: "inactive",
    is_system: true,
  },
  {
    id: "pip-003",
    name: "OSMU 마케팅 스웜",
    slug: "osmu-marketing",
    description:
      "하나의 아이디어를 블로그, 인스타그램, 뉴스레터, 숏폼 등 다중 채널용 콘텐츠로 자동 분할 생성하고 Figma 비주얼 렌더링까지 수행합니다.",
    category: "osmu_marketing",
    total_executions: 0,
    last_executed_at: null,
    status: "inactive",
    is_system: true,
  },
  {
    id: "pip-004",
    name: "AI 자율 유지보수 (Auto-Healing)",
    slug: "auto-healing",
    description:
      "크롤링 차단, API 에러를 자동 감지하고 예비 API 키 스위칭, IP 프록시 우회, 핫픽스 적용을 자율 수행 후 Slack으로 보고합니다.",
    category: "auto_healing",
    total_executions: 0,
    last_executed_at: null,
    status: "inactive",
    is_system: true,
  },
];

export async function GET(): Promise<NextResponse<PipelinesResponse>> {
  // Phase 2에서 Supabase 쿼리로 교체
  // const supabase = createClient();
  // const { data, error } = await supabase.from("pipelines").select("*");

  return NextResponse.json({
    data: MOCK_PIPELINES,
    total: MOCK_PIPELINES.length,
  });
}
```

**완료 기준**:
- [ ] `GET /api/pipelines` 요청 시 4개 파이프라인 mock 데이터 반환
- [ ] 응답 형식: `{ data: PipelineSummary[], total: number }`
- [ ] TypeScript 컴파일 에러 없음
- [ ] Phase 2 교체 지점에 주석 표시

---

### 2-2. 페이지: `apps/web/src/app/(dashboard)/pipelines/page.tsx`

기존 스켈레톤 페이지를 파이프라인 카드 목록으로 교체한다.

```tsx
"use client";

import { useEffect, useState } from "react";
import { GitBranch, Clock, Activity, AlertCircle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

// -- Types --
interface PipelineSummary {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  total_executions: number;
  last_executed_at: string | null;
  status: "active" | "inactive" | "error";
  is_system: boolean;
}

// -- 카테고리별 아이콘/색상 맵 --
const CATEGORY_META: Record<string, { color: string; label: string }> = {
  grant_factory: { color: "bg-blue-100 text-blue-700", label: "정부조달" },
  document_verification: { color: "bg-emerald-100 text-emerald-700", label: "서류검증" },
  osmu_marketing: { color: "bg-purple-100 text-purple-700", label: "OSMU" },
  auto_healing: { color: "bg-orange-100 text-orange-700", label: "Auto-Heal" },
};

// -- 상태 뱃지 --
const STATUS_META: Record<string, { color: string; label: string }> = {
  active: { color: "bg-green-100 text-green-700", label: "가동중" },
  inactive: { color: "bg-gray-100 text-gray-500", label: "대기" },
  error: { color: "bg-red-100 text-red-700", label: "에러" },
};

function PipelineCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-2 h-4 w-full" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-48" />
      </CardContent>
    </Card>
  );
}

export default function PipelinesPage() {
  const [pipelines, setPipelines] = useState<PipelineSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchPipelines() {
      try {
        const res = await fetch("/api/pipelines");
        if (!res.ok) {
          throw new Error(`파이프라인 목록 조회 실패: ${res.status}`);
        }
        const json: { data: PipelineSummary[]; total: number } = await res.json();
        setPipelines(json.data);
      } catch (err) {
        const message = err instanceof Error ? err.message : "알 수 없는 에러";
        console.error("[PipelinesPage] fetchPipelines 실패:", message);
      } finally {
        setIsLoading(false);
      }
    }
    void fetchPipelines();
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">파이프라인 모니터</h2>
          <p className="mt-1 text-gray-500">
            4대 핵심 파이프라인 실행 현황을 모니터링합니다
          </p>
        </div>
      </div>

      {/* 로딩 상태 */}
      {isLoading ? (
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <PipelineCardSkeleton key={`skeleton-${String(i)}`} />
          ))}
        </div>
      ) : pipelines.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="등록된 파이프라인이 없습니다"
          description="파이프라인을 생성하여 에이전트 워크플로우를 자동화하세요."
        />
      ) : (
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {pipelines.map((pipeline) => {
            const categoryMeta = CATEGORY_META[pipeline.category] ?? {
              color: "bg-gray-100 text-gray-700",
              label: pipeline.category,
            };
            const statusMeta = STATUS_META[pipeline.status] ?? {
              color: "bg-gray-100 text-gray-500",
              label: pipeline.status,
            };

            return (
              <Card key={pipeline.id} className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${categoryMeta.color}`}
                    >
                      {categoryMeta.label}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusMeta.color}`}
                    >
                      {statusMeta.label}
                    </span>
                  </div>
                  <CardTitle className="mt-2">{pipeline.name}</CardTitle>
                  <CardDescription>{pipeline.description}</CardDescription>
                </CardHeader>
                <CardFooter className="flex items-center gap-6 text-sm text-gray-500">
                  <div className="flex items-center gap-1.5">
                    <Activity className="h-4 w-4" />
                    <span>실행 {pipeline.total_executions}회</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    <span>
                      {pipeline.last_executed_at
                        ? new Date(pipeline.last_executed_at).toLocaleDateString("ko-KR")
                        : "미실행"}
                    </span>
                  </div>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* Phase 2 안내 */}
      <div className="mt-8 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-center">
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
          <AlertCircle className="h-4 w-4" />
          <span>파이프라인 실행 기능은 Phase 2에서 구현됩니다</span>
        </div>
      </div>
    </div>
  );
}
```

**완료 기준**:
- [ ] `/pipelines` 페이지에 4개 파이프라인 카드가 2열 그리드로 표시
- [ ] 각 카드에 이름, 설명, 카테고리 뱃지, 상태 뱃지, 실행 횟수, 마지막 실행일 표시
- [ ] 로딩 중 스켈레톤 표시
- [ ] 데이터 없을 때 EmptyState 표시
- [ ] TypeScript 컴파일 에러 없음

---

## Task 3: 크레딧/과금 기본 페이지

**목표**: 총 크레딧 잔액 카드와 최근 거래 내역 테이블, 워크스페이스별 소모량 막대 차트를 표시하는 기본 페이지를 구현한다.

### 3-1. BFF API 라우트: `apps/web/src/app/api/credits/route.ts`

GET /api/credits -- 잔액 + 최근 거래 내역 반환.

```typescript
import { NextResponse } from "next/server";

interface CreditTransaction {
  id: string;
  workspace_id: string;
  workspace_name: string;
  transaction_type: "charge" | "usage" | "refund" | "bonus" | "adjustment";
  amount: number;
  balance_after: number;
  description: string;
  created_at: string;
}

interface CreditOverview {
  total_balance: number;
  total_charged: number;
  total_used: number;
  currency: "credits";
}

interface WorkspaceUsage {
  workspace_id: string;
  workspace_name: string;
  used_credits: number;
}

interface CreditsResponse {
  overview: CreditOverview;
  recent_transactions: CreditTransaction[];
  workspace_usage: WorkspaceUsage[];
}

const MOCK_RESPONSE: CreditsResponse = {
  overview: {
    total_balance: 50000,
    total_charged: 100000,
    total_used: 50000,
    currency: "credits",
  },
  recent_transactions: [
    {
      id: "txn-001",
      workspace_id: "ws-001",
      workspace_name: "엉클로지텍",
      transaction_type: "usage",
      amount: -1200,
      balance_after: 50000,
      description: "정부조달 입찰 팩토리 실행 (GPT-4o 토큰 8,400)",
      created_at: "2026-03-10T14:30:00Z",
    },
    {
      id: "txn-002",
      workspace_id: "ws-002",
      workspace_name: "디어버블",
      transaction_type: "usage",
      amount: -800,
      balance_after: 51200,
      description: "OSMU 마케팅 스웜 실행 (Claude Sonnet 토큰 5,600)",
      created_at: "2026-03-10T11:15:00Z",
    },
    {
      id: "txn-003",
      workspace_id: "ws-001",
      workspace_name: "엉클로지텍",
      transaction_type: "usage",
      amount: -350,
      balance_after: 52000,
      description: "서류 자동 검증 실행 (PaddleOCR)",
      created_at: "2026-03-09T16:45:00Z",
    },
    {
      id: "txn-004",
      workspace_id: "ws-003",
      workspace_name: "마스터 HQ",
      transaction_type: "charge",
      amount: 100000,
      balance_after: 52350,
      description: "초기 크레딧 충전",
      created_at: "2026-03-01T09:00:00Z",
    },
  ],
  workspace_usage: [
    { workspace_id: "ws-001", workspace_name: "엉클로지텍", used_credits: 28500 },
    { workspace_id: "ws-002", workspace_name: "디어버블", used_credits: 14200 },
    { workspace_id: "ws-003", workspace_name: "마스터 HQ", used_credits: 7300 },
  ],
};

export async function GET(): Promise<NextResponse<CreditsResponse>> {
  // Phase 3에서 Supabase 연동으로 교체
  return NextResponse.json(MOCK_RESPONSE);
}
```

**완료 기준**:
- [ ] `GET /api/credits` 요청 시 overview, recent_transactions, workspace_usage 반환
- [ ] 응답 타입이 명확하게 정의됨
- [ ] TypeScript 컴파일 에러 없음

---

### 3-2. 페이지: `apps/web/src/app/(dashboard)/billing/page.tsx`

기존 스켈레톤 페이지를 크레딧 대시보드로 교체한다.

```tsx
"use client";

import { useEffect, useState } from "react";
import { CreditCard, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

// -- Types --
interface CreditTransaction {
  id: string;
  workspace_id: string;
  workspace_name: string;
  transaction_type: "charge" | "usage" | "refund" | "bonus" | "adjustment";
  amount: number;
  balance_after: number;
  description: string;
  created_at: string;
}

interface CreditOverview {
  total_balance: number;
  total_charged: number;
  total_used: number;
  currency: "credits";
}

interface WorkspaceUsage {
  workspace_id: string;
  workspace_name: string;
  used_credits: number;
}

interface CreditsData {
  overview: CreditOverview;
  recent_transactions: CreditTransaction[];
  workspace_usage: WorkspaceUsage[];
}

// -- 거래 유형 라벨/색상 --
const TXN_TYPE_META: Record<string, { label: string; color: string }> = {
  charge: { label: "충전", color: "text-green-600" },
  usage: { label: "사용", color: "text-red-600" },
  refund: { label: "환불", color: "text-blue-600" },
  bonus: { label: "보너스", color: "text-purple-600" },
  adjustment: { label: "조정", color: "text-gray-600" },
};

// -- 숫자 포맷 --
function formatCredits(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

// -- 워크스페이스별 사용량 막대 차트 (recharts 기반) --
// recharts를 dynamic import하여 SSR 문제를 방지한다
function WorkspaceUsageChart({ data }: { data: WorkspaceUsage[] }) {
  const maxUsed = Math.max(...data.map((d) => d.used_credits), 1);

  return (
    <div className="space-y-3">
      {data.map((ws) => {
        const widthPercent = (ws.used_credits / maxUsed) * 100;
        return (
          <div key={ws.workspace_id}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700">{ws.workspace_name}</span>
              <span className="text-gray-500">{formatCredits(ws.used_credits)} 크레딧</span>
            </div>
            <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-500"
                style={{ width: `${String(widthPercent)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function BillingPage() {
  const [data, setData] = useState<CreditsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchCredits() {
      try {
        const res = await fetch("/api/credits");
        if (!res.ok) {
          throw new Error(`크레딧 조회 실패: ${res.status}`);
        }
        const json: CreditsData = await res.json();
        setData(json);
      } catch (err) {
        const message = err instanceof Error ? err.message : "알 수 없는 에러";
        console.error("[BillingPage] fetchCredits 실패:", message);
      } finally {
        setIsLoading(false);
      }
    }
    void fetchCredits();
  }, []);

  if (isLoading) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-gray-900">크레딧 / 과금</h2>
        <p className="mt-1 text-gray-500">마스터 크레딧 사용량과 비용을 추적합니다</p>
        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={`skel-${String(i)}`}>
              <CardContent className="pt-6">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="mt-2 h-4 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon={CreditCard}
        title="크레딧 데이터를 불러올 수 없습니다"
        description="잠시 후 다시 시도해주세요."
      />
    );
  }

  const { overview, recent_transactions, workspace_usage } = data;

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">크레딧 / 과금</h2>
      <p className="mt-1 text-gray-500">마스터 크레딧 사용량과 비용을 추적합니다</p>

      {/* KPI 카드 3개 */}
      <div className="mt-6 grid gap-6 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-100">
              <Wallet className="h-6 w-6 text-brand-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">총 잔액</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCredits(overview.total_balance)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <TrendingUp className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">총 충전</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCredits(overview.total_charged)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-100">
              <TrendingDown className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">총 사용</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCredits(overview.total_used)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* 최근 거래 내역 테이블 (2/3 너비) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>최근 거래 내역</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>날짜</TableHead>
                  <TableHead>워크스페이스</TableHead>
                  <TableHead>유형</TableHead>
                  <TableHead>설명</TableHead>
                  <TableHead className="text-right">금액</TableHead>
                  <TableHead className="text-right">잔액</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent_transactions.map((txn) => {
                  const meta = TXN_TYPE_META[txn.transaction_type] ?? {
                    label: txn.transaction_type,
                    color: "text-gray-600",
                  };
                  return (
                    <TableRow key={txn.id}>
                      <TableCell className="whitespace-nowrap">
                        {new Date(txn.created_at).toLocaleDateString("ko-KR")}
                      </TableCell>
                      <TableCell>{txn.workspace_name}</TableCell>
                      <TableCell>
                        <span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{txn.description}</TableCell>
                      <TableCell className={`text-right font-mono ${meta.color}`}>
                        {txn.amount > 0 ? "+" : ""}
                        {formatCredits(txn.amount)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-gray-500">
                        {formatCredits(txn.balance_after)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* 워크스페이스별 소모량 차트 (1/3 너비) */}
        <Card>
          <CardHeader>
            <CardTitle>워크스페이스별 사용량</CardTitle>
          </CardHeader>
          <CardContent>
            <WorkspaceUsageChart data={workspace_usage} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

**완료 기준**:
- [ ] `/billing` 페이지에 3개 KPI 카드(잔액, 총충전, 총사용) 표시
- [ ] 최근 거래 내역 테이블에 날짜, 워크스페이스, 유형, 설명, 금액, 잔액 칼럼 표시
- [ ] 워크스페이스별 사용량 막대 차트 표시 (CSS 기반 -- Phase 3에서 recharts로 교체 가능)
- [ ] 로딩 중 스켈레톤 표시
- [ ] TypeScript 컴파일 에러 없음

---

## Task 4: 감사 로그 페이지 (기본)

**목표**: 감사 로그를 테이블 형태로 조회하고, 날짜/액션/워크스페이스 필터링, 페이지네이션을 지원하는 기본 페이지를 구현한다.

### 4-1. BFF API 라우트: `apps/web/src/app/api/audit-logs/route.ts`

GET /api/audit-logs -- 감사 로그 목록 조회 (필터링 + 페이지네이션).

```typescript
import { type NextRequest, NextResponse } from "next/server";

interface AuditLogEntry {
  id: string;
  workspace_id: string | null;
  workspace_name: string | null;
  user_id: string | null;
  user_name: string | null;
  agent_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  severity: "info" | "warning" | "error" | "critical";
  created_at: string;
}

interface AuditLogsResponse {
  data: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
}

const MOCK_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: "log-001",
    workspace_id: "ws-001",
    workspace_name: "엉클로지텍",
    user_id: "user-001",
    user_name: "회장",
    agent_id: null,
    action: "workspace.create",
    resource_type: "workspace",
    resource_id: "ws-001",
    details: { name: "엉클로지텍", slug: "uncle-logitech" },
    ip_address: "192.168.1.100",
    severity: "info",
    created_at: "2026-03-10T14:30:00Z",
  },
  {
    id: "log-002",
    workspace_id: "ws-001",
    workspace_name: "엉클로지텍",
    user_id: "user-001",
    user_name: "회장",
    agent_id: null,
    action: "agent.assign",
    resource_type: "agent_assignment",
    resource_id: "aa-001",
    details: { agent_name: "기획 에이전트", workspace_name: "엉클로지텍" },
    ip_address: "192.168.1.100",
    severity: "info",
    created_at: "2026-03-10T14:35:00Z",
  },
  {
    id: "log-003",
    workspace_id: "ws-001",
    workspace_name: "엉클로지텍",
    user_id: "user-001",
    user_name: "회장",
    agent_id: "agent-001",
    action: "pipeline.start",
    resource_type: "pipeline_execution",
    resource_id: "exec-001",
    details: { pipeline_name: "정부조달 입찰 팩토리", status: "running" },
    ip_address: "192.168.1.100",
    severity: "info",
    created_at: "2026-03-10T15:00:00Z",
  },
  {
    id: "log-004",
    workspace_id: "ws-002",
    workspace_name: "디어버블",
    user_id: "user-001",
    user_name: "회장",
    agent_id: null,
    action: "vault.access",
    resource_type: "secret_vault",
    resource_id: "sv-001",
    details: { secret_name: "Figma API Key", access_type: "read_meta" },
    ip_address: "192.168.1.100",
    severity: "warning",
    created_at: "2026-03-09T16:45:00Z",
  },
  {
    id: "log-005",
    workspace_id: null,
    workspace_name: null,
    user_id: "user-001",
    user_name: "회장",
    agent_id: null,
    action: "auth.login",
    resource_type: "auth",
    resource_id: null,
    details: { method: "email+mfa" },
    ip_address: "203.0.113.42",
    severity: "info",
    created_at: "2026-03-09T09:00:00Z",
  },
  {
    id: "log-006",
    workspace_id: "ws-001",
    workspace_name: "엉클로지텍",
    user_id: null,
    user_name: null,
    agent_id: "agent-005",
    action: "pipeline.step.failed",
    resource_type: "pipeline_step",
    resource_id: "step-003",
    details: { step_name: "OCR 검수", error: "PaddleOCR 타임아웃" },
    ip_address: null,
    severity: "error",
    created_at: "2026-03-08T22:10:00Z",
  },
];

export async function GET(request: NextRequest): Promise<NextResponse<AuditLogsResponse>> {
  const { searchParams } = request.nextUrl;
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = parseInt(searchParams.get("limit") ?? "20", 10);
  const action = searchParams.get("action");
  const workspaceId = searchParams.get("workspace_id");
  const severity = searchParams.get("severity");

  let filtered = [...MOCK_AUDIT_LOGS];

  if (action) {
    filtered = filtered.filter((log) => log.action.includes(action));
  }
  if (workspaceId) {
    filtered = filtered.filter((log) => log.workspace_id === workspaceId);
  }
  if (severity) {
    filtered = filtered.filter((log) => log.severity === severity);
  }

  const total = filtered.length;
  const start = (page - 1) * limit;
  const data = filtered.slice(start, start + limit);

  return NextResponse.json({ data, total, page, limit });
}
```

**완료 기준**:
- [ ] `GET /api/audit-logs` 요청 시 mock 감사 로그 반환
- [ ] 쿼리 파라미터: `page`, `limit`, `action`, `workspace_id`, `severity`
- [ ] 페이지네이션 정상 작동
- [ ] TypeScript 컴파일 에러 없음

---

### 4-2. 페이지: `apps/web/src/app/(dashboard)/audit-logs/page.tsx`

기존 스켈레톤 페이지를 감사 로그 테이블로 교체한다.

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { FileText, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

// -- Types --
interface AuditLogEntry {
  id: string;
  workspace_id: string | null;
  workspace_name: string | null;
  user_id: string | null;
  user_name: string | null;
  agent_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  severity: "info" | "warning" | "error" | "critical";
  created_at: string;
}

// -- 심각도 뱃지 --
const SEVERITY_META: Record<string, { color: string; label: string }> = {
  info: { color: "bg-blue-100 text-blue-700", label: "정보" },
  warning: { color: "bg-yellow-100 text-yellow-700", label: "경고" },
  error: { color: "bg-red-100 text-red-700", label: "에러" },
  critical: { color: "bg-red-200 text-red-900", label: "치명적" },
};

// -- 액션 필터 옵션 --
const ACTION_FILTERS = [
  { value: "", label: "전체" },
  { value: "workspace", label: "워크스페이스" },
  { value: "agent", label: "에이전트" },
  { value: "pipeline", label: "파이프라인" },
  { value: "vault", label: "시크릿 볼트" },
  { value: "auth", label: "인증" },
];

const ITEMS_PER_PAGE = 20;

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(ITEMS_PER_PAGE),
      });
      if (actionFilter) {
        params.set("action", actionFilter);
      }
      if (severityFilter) {
        params.set("severity", severityFilter);
      }

      const res = await fetch(`/api/audit-logs?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`감사 로그 조회 실패: ${res.status}`);
      }
      const json: { data: AuditLogEntry[]; total: number } = await res.json();
      setLogs(json.data);
      setTotal(json.total);
    } catch (err) {
      const message = err instanceof Error ? err.message : "알 수 없는 에러";
      console.error("[AuditLogsPage] fetchLogs 실패:", message);
    } finally {
      setIsLoading(false);
    }
  }, [page, actionFilter, severityFilter]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">감사 로그</h2>
      <p className="mt-1 text-gray-500">시스템 전체 액션 이력을 조회합니다</p>

      {/* 필터 바 */}
      <Card className="mt-6">
        <CardContent className="flex flex-wrap items-center gap-4 pt-6">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">필터:</span>
          </div>

          {/* 액션 유형 필터 */}
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {ACTION_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>

          {/* 심각도 필터 */}
          <select
            value={severityFilter}
            onChange={(e) => {
              setSeverityFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">전체 심각도</option>
            <option value="info">정보</option>
            <option value="warning">경고</option>
            <option value="error">에러</option>
            <option value="critical">치명적</option>
          </select>
        </CardContent>
      </Card>

      {/* 감사 로그 테이블 */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>로그 목록 ({total}건)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={`skel-${String(i)}`} className="h-12 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="감사 로그가 없습니다"
              description="필터 조건을 변경하거나, 시스템 활동이 기록되면 여기에 표시됩니다."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead>액션</TableHead>
                    <TableHead>리소스</TableHead>
                    <TableHead>사용자/에이전트</TableHead>
                    <TableHead>워크스페이스</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>심각도</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const sevMeta = SEVERITY_META[log.severity] ?? {
                      color: "bg-gray-100 text-gray-500",
                      label: log.severity,
                    };
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap text-xs text-gray-500">
                          {new Date(log.created_at).toLocaleString("ko-KR")}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{log.action}</TableCell>
                        <TableCell className="text-xs text-gray-500">
                          {log.resource_type}
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.user_name ?? log.agent_id ?? "-"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.workspace_name ?? "시스템"}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-gray-400">
                          {log.ip_address ?? "-"}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${sevMeta.color}`}
                          >
                            {sevMeta.label}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* 페이지네이션 */}
              {totalPages > 1 ? (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-gray-500">
                    {total}건 중 {(page - 1) * ITEMS_PER_PAGE + 1}~
                    {Math.min(page * ITEMS_PER_PAGE, total)}건 표시
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-gray-700">
                      {page} / {totalPages}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

**완료 기준**:
- [ ] `/audit-logs` 페이지에 감사 로그 테이블 표시
- [ ] 테이블 칼럼: 날짜, 액션, 리소스, 사용자/에이전트, 워크스페이스, IP, 심각도
- [ ] 액션 유형 필터 (전체/워크스페이스/에이전트/파이프라인/시크릿/인증)
- [ ] 심각도 필터 (전체/정보/경고/에러/치명적)
- [ ] 페이지네이션 (이전/다음 버튼, 현재 페이지 표시)
- [ ] 로딩 중 스켈레톤 표시
- [ ] 데이터 없을 때 EmptyState 표시
- [ ] TypeScript 컴파일 에러 없음

---

## Task 5: 설정 페이지 (기본)

**목표**: 프로필, MFA 관리, 시스템 정보 3개 섹션으로 구성된 기본 설정 페이지를 구현한다.

### 5-1. 페이지: `apps/web/src/app/(dashboard)/settings/page.tsx`

기존 스켈레톤 페이지를 탭 기반 설정 페이지로 교체한다.

```tsx
"use client";

import { useState } from "react";
import { User, Shield, Info, ExternalLink } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// -- 프로필 섹션 --
function ProfileSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>프로필</CardTitle>
        <CardDescription>기본 계정 정보를 확인합니다</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 아바타 */}
        <div className="flex items-center gap-4">
          <Avatar size="xl">
            <AvatarFallback>CK</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-lg font-semibold text-gray-900">Creator Kim</p>
            <p className="text-sm text-gray-500">총괄 회장 (Owner)</p>
          </div>
        </div>

        {/* 정보 필드 */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-gray-500">이름</label>
            <p className="mt-1 text-gray-900">Creator Kim</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">이메일</label>
            <p className="mt-1 text-gray-900">creator@masteros.io</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">역할</label>
            <p className="mt-1 text-gray-900">Owner</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">마지막 로그인</label>
            <p className="mt-1 text-gray-900">2026-03-10 14:30 KST</p>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4">
          <p className="text-xs text-gray-400">
            프로필 수정은 Supabase Auth 연동 후 활성화됩니다 (Phase 0 완료 시)
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// -- MFA 관리 섹션 --
function MFASection() {
  const [mfaEnabled, setMfaEnabled] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>다단계 인증 (MFA)</CardTitle>
        <CardDescription>TOTP 기반 2단계 인증을 관리합니다</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
          <div>
            <p className="font-medium text-gray-900">TOTP 인증기</p>
            <p className="text-sm text-gray-500">
              Google Authenticator, Authy 등 TOTP 앱을 사용합니다
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={mfaEnabled}
            onClick={() => setMfaEnabled((prev) => !prev)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
              mfaEnabled ? "bg-brand-600" : "bg-gray-200"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ${
                mfaEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {mfaEnabled ? (
          <div className="rounded-lg border border-dashed border-brand-300 bg-brand-50 p-4">
            <p className="text-sm text-brand-700">
              MFA 등록 플로우는 Supabase Auth 연동 후 활성화됩니다.
              현재는 UI 토글만 제공됩니다.
            </p>
          </div>
        ) : null}

        <div className="border-t border-gray-200 pt-4">
          <p className="text-xs text-gray-400">
            PRD 요구사항: MFA TOTP 필수 (F-01). 프로덕션 배포 전 반드시 활성화해야 합니다.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// -- 시스템 정보 섹션 --
function SystemInfoSection() {
  const systemInfo = {
    version: "0.1.0",
    environment: "development",
    nextVersion: "14.2",
    nodeVersion: typeof process !== "undefined" ? "20.x" : "N/A",
    supabaseStatus: "미연결",
    fastApiStatus: "미연결",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>시스템 정보</CardTitle>
        <CardDescription>The Master OS 시스템 상태를 확인합니다</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-500">버전</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">v{systemInfo.version}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-500">환경</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{systemInfo.environment}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-500">Next.js</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">v{systemInfo.nextVersion}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-500">Node.js</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{systemInfo.nodeVersion}</p>
          </div>
        </div>

        {/* 연결 상태 */}
        <div className="mt-6 space-y-3">
          <h4 className="text-sm font-medium text-gray-700">외부 서비스 상태</h4>
          <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-gray-300" />
              <span className="text-sm text-gray-700">Supabase (PostgreSQL + Auth)</span>
            </div>
            <span className="text-xs text-gray-400">{systemInfo.supabaseStatus}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-gray-300" />
              <span className="text-sm text-gray-700">FastAPI (Orchestration Engine)</span>
            </div>
            <span className="text-xs text-gray-400">{systemInfo.fastApiStatus}</span>
          </div>
        </div>

        <div className="mt-6 border-t border-gray-200 pt-4">
          <Button variant="ghost" size="sm">
            <ExternalLink className="h-4 w-4" />
            시스템 헬스체크 실행
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// -- 메인 설정 페이지 --
export default function SettingsPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">설정</h2>
      <p className="mt-1 text-gray-500">시스템 전역 설정을 관리합니다</p>

      <Tabs defaultValue="profile" className="mt-6">
        <TabsList>
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            프로필
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            보안
          </TabsTrigger>
          <TabsTrigger value="system" className="flex items-center gap-2">
            <Info className="h-4 w-4" />
            시스템
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileSection />
        </TabsContent>
        <TabsContent value="security">
          <MFASection />
        </TabsContent>
        <TabsContent value="system">
          <SystemInfoSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

**완료 기준**:
- [ ] `/settings` 페이지에 3개 탭(프로필, 보안, 시스템) 표시
- [ ] 프로필 탭: 아바타, 이름, 이메일(읽기 전용), 역할, 마지막 로그인 표시
- [ ] 보안 탭: MFA 등록/해제 토글 (UI만 -- Supabase 연동은 Phase 0 후)
- [ ] 시스템 탭: 버전, 환경, Next.js 버전, Supabase 상태, FastAPI 상태 표시
- [ ] 탭 전환 시 콘텐츠가 올바르게 변경
- [ ] TypeScript 컴파일 에러 없음

---

## 전체 완료 후 체크리스트

모든 5개 태스크 완료 후 아래를 확인한다:

1. [ ] `apps/web/src/components/ui/` 디렉토리에 8개 UI 컴포넌트 파일 존재
2. [ ] `apps/web/src/hooks/use-toast.ts` 존재
3. [ ] `apps/web/src/app/api/pipelines/route.ts` 존재 (GET /api/pipelines)
4. [ ] `apps/web/src/app/api/credits/route.ts` 존재 (GET /api/credits)
5. [ ] `apps/web/src/app/api/audit-logs/route.ts` 존재 (GET /api/audit-logs)
6. [ ] 4개 페이지 교체 완료: `/pipelines`, `/billing`, `/audit-logs`, `/settings`
7. [ ] `pnpm type-check --filter=web` 에러 없음
8. [ ] `pnpm lint --filter=web` 에러 없음 (경고 허용)
9. [ ] `pnpm dev --filter=web` 실행 후 4개 페이지 브라우저에서 정상 렌더링 확인
10. [ ] 추가 패키지 설치: `@radix-ui/react-avatar`
11. [ ] `PARALLEL/CLAUDE2_PHASE1_REPORT.md`에 모든 태스크 결과 기록
12. [ ] REPORT 파일 마지막에 `## 완료 상태: DONE` 추가

---

## 참고: Claude 1과의 작업 경계

| 영역 | Claude 1 (핵심) | Claude 2 (보조) |
|------|-----------------|-----------------|
| 워크스페이스 CRUD + RLS | API 라우트 + Supabase 쿼리 + RLS 정책 | -- |
| 에이전트 풀 관리 | API 라우트 + Drag & Drop 캔버스 + React Flow | -- |
| God Mode 대시보드 | KPI 스트립 + 법인 조감도 + 알림 피드 | -- |
| 공통 UI 컴포넌트 | -- | card, table, tabs, toast, dropdown, avatar, skeleton, empty-state |
| 파이프라인 목록 (기본) | -- | mock BFF + 카드 목록 페이지 |
| 크레딧/과금 (기본) | -- | mock BFF + KPI 카드 + 거래 테이블 + 차트 |
| 감사 로그 (기본) | -- | mock BFF + 필터 + 테이블 + 페이지네이션 |
| 설정 페이지 (기본) | -- | 프로필 + MFA + 시스템 정보 |

---

*버전: v1.0 | TEAM_G (ARCHITECT + PRD_MASTER) | Phase 1 경량 태스크 | 2026.02.26*

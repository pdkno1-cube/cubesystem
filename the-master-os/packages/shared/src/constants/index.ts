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

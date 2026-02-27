# SKILL-GDRIVE-FOLDER-MANAGER

> 버전: v1.0 | 작성: TEAM_F_SKILLS | 2026-02-27
> 구현: `apps/api/app/mcp/google_drive.py` + `apps/api/app/mcp/gdrive_folder_policy.py`

---

## 개요

Google Drive 폴더를 **중복 없이** 생성·관리하는 MCP 스킬.
OSMU 파이프라인에서 콘텐츠 저장 전 표준 폴더 트리를 보장한다.

---

## 폴더 트리 표준

```
My Drive/
└── The Master OS/
    ├── pipelines/{pipeline-id}/{YYYY-MM}/   ← 파이프라인 실행 결과
    ├── agents/{agent-name}/                  ← 에이전트별 작업물
    ├── exports/                              ← 최종 발행 파일
    └── archive/                             ← 90일 후 자동 이동
```

**네이밍 규칙** (`gdrive_folder_policy.py::slugify`):
- 소문자 + 하이픈만 허용
- 최대 50자
- 공백 → 하이픈, 특수문자 → 제거

---

## 지원 액션 (4개 신규 추가)

### 1. `find_or_create_folder` — 핵심 FindOrCreate

**중복 폴더 생성 절대 금지** 원칙을 구현하는 핵심 액션.

```python
params = {
    "name": "2026-02",           # 폴더명
    "parent_id": "folder-id-xyz" # 부모 폴더 ID (없으면 "root")
}
# Returns:
{
    "folder_id": "1abc...",
    "folder_name": "2026-02",
    "created": False  # True면 새로 생성, False면 기존 폴더 재사용
}
```

### 2. `ensure_folder_path` — 전체 경로 한 번에 보장

`find_or_create_folder`를 재귀 호출해 전체 경로를 생성/확인한다.

```python
from app.mcp.gdrive_folder_policy import pipeline_folder_path

params = {
    "path_components": pipeline_folder_path("osmu-abc123"),
    # → ["The Master OS", "pipelines", "osmu-abc123", "2026-02"]
    "root_parent_id": "root"
}
# Returns:
{
    "leaf_folder_id": "1xyz...",  # 최하위 폴더 ID (업로드 대상)
    "path": ["The Master OS", "pipelines", "osmu-abc123", "2026-02"],
    "created_count": 2            # 새로 생성된 폴더 수
}
```

### 3. `list_folders` — 하위 폴더 목록

```python
params = {
    "parent_id": "1abc...",  # 조회할 부모 폴더
    "page_size": 50
}
# Returns:
{
    "folders": [{"id": "...", "name": "2026-01", "modifiedTime": "..."}],
    "total": 3
}
```

### 4. `move_to_archive` — 아카이브 이동

```python
params = {
    "file_id": "1file...",           # 이동할 파일/폴더 ID
    "archive_folder_id": "1arch...", # 아카이브 폴더 ID
    "current_parent_id": "1parent..." # 현재 부모 (removeParents용)
}
# Returns:
{"moved": True, "file_id": "...", "archive_folder_id": "..."}
```

---

## 파이프라인 연동 패턴

```python
# pipeline/executor.py 에서 업로드 전 폴더 보장
from app.mcp.gdrive_folder_policy import pipeline_folder_path

async def save_to_drive(pipeline_id: str, file_content: str, file_name: str):
    gdrive = registry.get_client("google_drive")

    # 1. 폴더 경로 보장 (FindOrCreate)
    folder_result = await gdrive.execute("ensure_folder_path", {
        "path_components": pipeline_folder_path(pipeline_id)
    })
    folder_id = folder_result["leaf_folder_id"]

    # 2. 파일 업로드 (폴더 ID 지정)
    return await gdrive.execute("upload", {
        "file_name": file_name,
        "file_content": file_content,
        "mime_type": "text/markdown",
        "folder_id": folder_id,
    })
```

---

## 정책 함수 (gdrive_folder_policy.py)

| 함수 | 반환 예시 |
|------|-----------|
| `pipeline_folder_path(id, dt)` | `["The Master OS", "pipelines", "osmu-abc", "2026-02"]` |
| `agent_folder_path(name)` | `["The Master OS", "agents", "blog-agent"]` |
| `exports_folder_path()` | `["The Master OS", "exports"]` |
| `archive_folder_path()` | `["The Master OS", "archive"]` |
| `slugify(name)` | `"blog-agent-2026"` |

---

## 보안

- Google Drive 서비스 계정 → Secret Vault 저장 (P0)
- 서비스 계정은 `The Master OS` 폴더만 접근 권한 부여 (최소 권한)
- `find_or_create_folder` 검색 시 `trashed=false` 필터 필수

---

## 테스트

```bash
# 단위 테스트 위치
apps/api/tests/test_mcp_gdrive_folder.py

# 수동 검증
# 1. find_or_create_folder 2회 호출 → created: False 확인
# 2. ensure_folder_path → Drive에서 트리 구조 확인
# 3. move_to_archive → archive 폴더로 이동 확인
```

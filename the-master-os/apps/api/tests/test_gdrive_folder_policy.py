"""Unit tests for Google Drive folder naming policy functions."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.mcp.gdrive_folder_policy import (
    ROOT_FOLDER_NAME,
    agent_folder_path,
    archive_folder_path,
    exports_folder_path,
    pipeline_folder_path,
    slugify,
    validate_folder_name,
)


class TestSlugify:
    def test_lowercase(self) -> None:
        assert slugify("BlogAgent") == "blogagent"

    def test_spaces_become_hyphens(self) -> None:
        assert slugify("pipe abc 123") == "pipe-abc-123"

    def test_underscore_becomes_hyphen(self) -> None:
        assert slugify("OSMU_2026") == "osmu-2026"

    def test_special_chars_removed(self) -> None:
        assert slugify("hello@world!") == "helloworld"

    def test_multiple_hyphens_collapsed(self) -> None:
        assert slugify("a--b---c") == "a-b-c"

    def test_leading_trailing_hyphens_stripped(self) -> None:
        assert slugify("-hello-") == "hello"

    def test_max_length_50(self) -> None:
        long_name = "a" * 60
        result = slugify(long_name)
        assert len(result) == 50

    def test_empty_string(self) -> None:
        assert slugify("") == ""


class TestPipelineFolderPath:
    def test_returns_four_components(self) -> None:
        path = pipeline_folder_path("osmu-abc123")
        assert len(path) == 4

    def test_first_component_is_root(self) -> None:
        path = pipeline_folder_path("my-pipeline")
        assert path[0] == ROOT_FOLDER_NAME

    def test_second_component_is_pipelines(self) -> None:
        path = pipeline_folder_path("my-pipeline")
        assert path[1] == "pipelines"

    def test_pipeline_id_is_slugified(self) -> None:
        path = pipeline_folder_path("My Pipeline ID")
        assert path[2] == "my-pipeline-id"

    def test_month_format(self) -> None:
        dt = datetime(2026, 2, 27, tzinfo=timezone.utc)
        path = pipeline_folder_path("test", dt=dt)
        assert path[3] == "2026-02"

    def test_default_uses_current_date(self) -> None:
        path = pipeline_folder_path("test")
        now = datetime.now(tz=timezone.utc)
        assert path[3] == now.strftime("%Y-%m")


class TestAgentFolderPath:
    def test_returns_three_components(self) -> None:
        path = agent_folder_path("BlogAgent")
        assert len(path) == 3

    def test_structure(self) -> None:
        path = agent_folder_path("BlogAgent")
        assert path == [ROOT_FOLDER_NAME, "agents", "blogagent"]


class TestExportsFolderPath:
    def test_returns_exports_path(self) -> None:
        assert exports_folder_path() == [ROOT_FOLDER_NAME, "exports"]


class TestArchiveFolderPath:
    def test_returns_archive_path(self) -> None:
        assert archive_folder_path() == [ROOT_FOLDER_NAME, "archive"]


class TestValidateFolderName:
    def test_valid_name_returns_slug(self) -> None:
        assert validate_folder_name("My Folder") == "my-folder"

    def test_empty_name_raises_value_error(self) -> None:
        with pytest.raises(ValueError, match="Invalid folder name"):
            validate_folder_name("")

    def test_only_special_chars_raises_value_error(self) -> None:
        with pytest.raises(ValueError, match="Invalid folder name"):
            validate_folder_name("@@@!!!")

    def test_max_length_enforced(self) -> None:
        result = validate_folder_name("a" * 60)
        assert len(result) == 50

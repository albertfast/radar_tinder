#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


def _replace_all(text: str, replacements: list[tuple[re.Pattern[str], str]]) -> tuple[str, list[str]]:
    updated = text
    changes: list[str] = []
    for pattern, replacement in replacements:
        updated, count = pattern.subn(replacement, updated)
        if count:
            changes.append(f"{pattern.pattern} -> {count} replacement(s)")
    return updated, changes


def _update_file(path: Path, replacements: list[tuple[re.Pattern[str], str]], apply: bool) -> int:
    original = path.read_text(encoding="utf-8")
    updated, changes = _replace_all(original, replacements)

    if not changes:
        print(f"[OK] {path}: no changes needed")
        return 0

    print(f"[CHANGE] {path}")
    for line in changes:
        print(f"  - {line}")

    if apply:
        path.write_text(updated, encoding="utf-8")
        print(f"[OK] {path}: updated")
    else:
        print(f"[DRY-RUN] {path}: not written (pass --apply)")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Bump Kotlin/Gradle Kotlin plugin versions for an Expo/RN Android project."
    )
    parser.add_argument(
        "--project-root",
        default=".",
        help="Path to the project root (defaults to current directory).",
    )
    parser.add_argument(
        "--version",
        required=True,
        help="Target Kotlin version (e.g. 2.1.0).",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write changes to disk (default is dry-run).",
    )
    args = parser.parse_args()

    project_root = Path(args.project_root).resolve()
    version = args.version.strip()
    if not version:
        print("[ERROR] --version must be non-empty", file=sys.stderr)
        return 2

    android_build_gradle = project_root / "android" / "build.gradle"
    react_settings_gradle_kts = project_root / "android" / "react-settings-plugin" / "build.gradle.kts"

    missing = [p for p in (android_build_gradle, react_settings_gradle_kts) if not p.exists()]
    if missing:
        for p in missing:
            print(f"[ERROR] Missing expected file: {p}", file=sys.stderr)
        return 2

    android_build_gradle_replacements: list[tuple[re.Pattern[str], str]] = [
        (
            re.compile(
                r"(kotlinVersion\s*=\s*findProperty\('android\.kotlinVersion'\)\s*\?:\s*')([^']+)(')"
            ),
            rf"\g<1>{version}\g<3>",
        ),
        (
            re.compile(
                r"(classpath\(['\"]org\.jetbrains\.kotlin:kotlin-gradle-plugin:)([^'\"]+)(['\"]\))"
            ),
            rf"\g<1>{version}\g<3>",
        ),
    ]

    react_settings_replacements: list[tuple[re.Pattern[str], str]] = [
        (re.compile(r'(kotlin\("jvm"\)\s+version\s+")([^"]+)(")'), rf"\g<1>{version}\g<3>"),
    ]

    rc = 0
    rc |= _update_file(android_build_gradle, android_build_gradle_replacements, apply=args.apply)
    rc |= _update_file(react_settings_gradle_kts, react_settings_replacements, apply=args.apply)
    return rc


if __name__ == "__main__":
    raise SystemExit(main())

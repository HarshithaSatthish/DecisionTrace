from __future__ import annotations

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "decisiontrace-integration-testing.zip"
EXCLUDED_PARTS = {"__pycache__", ".pytest_cache", ".venv", "reports"}


def main() -> None:
    with ZipFile(OUTPUT, "w", compression=ZIP_DEFLATED) as archive:
        for path in sorted(ROOT.rglob("*")):
            if not path.is_file() or path == OUTPUT:
                continue
            relative = path.relative_to(ROOT)
            if any(part in EXCLUDED_PARTS for part in relative.parts):
                continue
            if relative.name.endswith((".pyc", ".pyo")):
                continue
            archive.write(path, Path("decisiontrace-integration-testing") / relative)
    print(f"Created {OUTPUT.name} ({OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()

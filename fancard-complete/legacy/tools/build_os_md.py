#!/usr/bin/env python3
"""Bundle the Fancard operating system into ONE markdown file.

Usage:  python3 build_os_md.py <source_dir> <output.md>

Every text source (py, js, html, json, md, txt, css, svg) is embedded verbatim
in a fenced block with its relative path as a heading. Binary assets (png, webp,
jpg, mp4, gif, woff2, ...) are listed with size and SHA-256 so the bundle stays
readable and regenerating them from the sources can be verified.
"""
import hashlib, os, sys
from datetime import datetime, timezone

TEXT_EXT = {".py", ".js", ".mjs", ".html", ".json", ".md", ".txt", ".css", ".svg", ".sh", ".yaml", ".yml"}
SKIP_DIRS = {"__pycache__", ".git", "node_modules"}

def lang(ext):
    return {".py": "python", ".js": "javascript", ".mjs": "javascript", ".html": "html",
            ".json": "json", ".md": "markdown", ".css": "css", ".svg": "xml",
            ".sh": "bash"}.get(ext, "")

def main(src, out):
    src = os.path.abspath(src)
    files = []
    for root, dirs, names in os.walk(src):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
        for n in sorted(names):
            files.append(os.path.join(root, n))
    text, binary = [], []
    for p in files:
        rel = os.path.relpath(p, src).replace(os.sep, "/")
        ext = os.path.splitext(rel)[1].lower()
        if ext in TEXT_EXT:
            text.append((rel, p, ext))
        else:
            binary.append((rel, p))
    with open(out, "w", encoding="utf-8") as f:
        f.write("# Fancard Operating System: single-file source bundle\n\n")
        f.write(f"Generated {datetime.now(timezone.utc).isoformat(timespec='seconds')} from `{os.path.basename(src)}`.\n\n")
        f.write(f"- Text sources embedded: {len(text)}\n- Binary assets listed (regenerate from sources): {len(binary)}\n\n")
        f.write("## Contents\n\n")
        for rel, _, _ in text:
            f.write(f"- `{rel}`\n")
        f.write("\n## Binary assets (regenerate, do not hand-edit)\n\n")
        f.write("| Path | Bytes | SHA-256 |\n|---|---|---|\n")
        for rel, p in binary:
            with open(p, "rb") as b:
                data = b.read()
            f.write(f"| `{rel}` | {len(data)} | `{hashlib.sha256(data).hexdigest()[:16]}` |\n")
        for rel, p, ext in text:
            with open(p, encoding="utf-8", errors="replace") as t:
                body = t.read()
            fence = "~~~~" if "```" in body else "```"
            f.write(f"\n---\n\n## `{rel}`\n\n{fence}{lang(ext)}\n{body.rstrip()}\n{fence}\n")
    print(f"wrote {out}: {len(text)} text files, {len(binary)} binary assets listed")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])

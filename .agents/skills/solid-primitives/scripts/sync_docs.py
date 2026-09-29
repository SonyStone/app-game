#!/usr/bin/env python3
"""Refresh bundled documentation from an explicitly supplied Solid Primitives checkout."""

import argparse
from collections import OrderedDict
from datetime import date
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import urljoin, urlsplit


MARKER = "<!-- BUNDLED-CATALOGUE:START -->"
UPSTREAM = "https://github.com/solidjs-community/solid-primitives"


def api_names(readme):
    """Supplement catalogue entries with explicit API headings and local API links."""
    names = re.findall(r"\[`([A-Za-z_$][\w$]*)`\]\(#[^)]+\)", readme)
    for heading in re.findall(r"^## +(.+)$", readme, re.M):
        name = heading.strip("` ")
        if re.fullmatch(r"[a-z_$][\w$]*", name):
            names.append(name)
    for section in re.findall(r'^## List of variables\n(.*?)(?=^## |\Z)', readme, re.M | re.S):
        names.extend(re.findall(r'^- `([A-Za-z_$][\w$]*)`', section, re.M))
    return names


def heading_anchors(readme):
    readme = re.sub(r'^```.*?^```\s*$', '', readme, flags=re.M | re.S)
    anchors = set()
    counts = {}
    for title in re.findall(r'^#{1,6}\s+(.+)$', readme, re.M):
        title = re.sub(r'`([^`]+)`', lambda m: m[1].replace('<', '').replace('>', ''), title)
        title = re.sub(r'\[([^]]+)\]\([^)]+\)', r'\1', title)
        title = re.sub(r'<[^>]*>', '', title).lower()
        slug = re.sub(r'[^\w\- ]', '', title).replace(' ', '-')
        count = counts.get(slug, 0)
        counts[slug] = count + 1
        anchors.add(slug + (f'-{count}' if count else ''))
    anchors.update(re.findall(r'(?:id|name)=[\"\x27]([^\"\x27]+)', readme))
    return anchors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    args = parser.parse_args()
    source = args.source.resolve()
    skill = Path(__file__).resolve().parents[1]
    purposes = json.loads((skill / "references/purposes.json").read_text())
    if not isinstance(purposes, dict) or any(
        not isinstance(value, str) or not value.strip() for value in purposes.values()
    ):
        raise ValueError("Purpose descriptions must be nonempty strings keyed by package name")
    root_readme = (source / "README.md").read_text()
    packages = {}
    for manifest in sorted(source.glob("packages/*/package.json")):
        metadata = json.loads(manifest.read_text())
        readme = manifest.with_name("README.md").read_text()
        if re.search(r"^<<<<<<< ", readme, re.M):
            raise ValueError(f"Resolve conflicts in {manifest.with_name('README.md')}")
        packages[manifest.parent.name] = (metadata, readme)
    if not packages:
        raise ValueError("No package documentation found at the supplied source")
    missing_purposes = sorted(packages.keys() - purposes.keys())
    if missing_purposes:
        print("Review Purpose descriptions for new packages in references/purposes.json: "
              + ", ".join(missing_purposes))

    categories = OrderedDict()
    catalogue = root_readme.split("<!-- INSERT-PRIMITIVES-TABLE:START -->", 1)[1]
    catalogue = catalogue.split("<!-- INSERT-PRIMITIVES-TABLE:END -->", 1)[0]
    listed = set()
    for line in catalogue.splitlines():
        category = re.search(r"<h4>\*([^*]+)\*</h4>", line)
        if category:
            current = categories.setdefault(category[1], [])
        elif line.startswith("|["):
            cells = line.split("|")
            name = re.search(r"\[([^]]+)\]", cells[1])[1]
            if name not in packages:
                raise ValueError(f"Catalogue package has no bundled README: {name}")
            names = re.findall(r"\[([^]]+)\]\([^)]+\)", cells[3])
            current.append((name, names))
            listed.add(name)

    for name, (metadata, _) in packages.items():
        if name not in listed and name != "utils":
            category = (metadata.get("primitive") or {}).get("category", "Additional packages")
            categories.setdefault(category, []).append((name, []))

    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=source, text=True).strip()
    branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=source, text=True).strip()
    generated = str(date.today())
    destination = skill / "references/primitives"
    destination.mkdir(parents=True, exist_ok=True)
    anchors = {name: heading_anchors(readme) for name, (_, readme) in packages.items()}

    def package_link(name, fragment):
        if fragment not in anchors[name]:
            fragment = fragment.lower() if fragment.lower() in anchors[name] else ''
        return name + '.md' + (f'#{fragment}' if fragment else '')

    def rewrite_url(url, name):
        # Package documentation stays within the bundle, regardless of upstream branch.
        pattern = re.escape(UPSTREAM) + r"/(?:tree|blob)/[^/]+/packages/([^/#]+)(?:/README\.md)?/?(?:#.*)?$"
        match = re.fullmatch(pattern, url)
        if match and match[1] in packages:
            return package_link(match[1], urlsplit(url).fragment)
        if url.startswith('#'):
            return package_link(name, url[1:])
        if urlsplit(url).scheme or url.startswith("//"):
            return url
        base = f"{UPSTREAM}/blob/{revision}/packages/{name}/README.md"
        resolved = urljoin(base, url)
        match = re.fullmatch(pattern, resolved)
        return rewrite_url(resolved, name) if match else resolved

    for name, (metadata, readme) in packages.items():
        # Remove presentation-only banners and badges; retain all prose and examples.
        readme = re.sub(r'\A\s*<p>\s*<img[^>]+>\s*</p>\s*', '', readme)
        readme = re.sub(r'^\[!\[[^\n]*\n', '', readme, flags=re.M)
        # Leave fenced examples unchanged while relocating documentation links.
        parts = re.split(r'(^```[^\n]*\n.*?^```\s*$)', readme, flags=re.M | re.S)
        for index in range(0, len(parts), 2):
            parts[index] = re.sub(
                r'(\]\()([^\s)]+)',
                lambda m: m[1] + rewrite_url(m[2], name), parts[index]
            )
            parts[index] = re.sub(
                r'(^\[[^]\n]+\]:\s*)(\S+)',
                lambda m: m[1] + rewrite_url(m[2], name), parts[index], flags=re.M
            )
        readme = ''.join(parts)
        title, _, body = readme.partition('\n')
        provenance = (
            f"Source version: `{metadata['version']}`.\n\n"
            f"[Upstream source]({UPSTREAM}/blob/{revision}/packages/{name}/README.md) "
            "· [Skill catalogue](../catalogue.md#primitives-catalogue)\n"
        )
        (destination / f"{name}.md").write_text(f"{title}\n\n{provenance}{body}")

    def entry(name, original):
        metadata, readme = packages[name]
        names = list(dict.fromkeys(original + (metadata.get('primitive') or {}).get('list', []) + api_names(readme)))
        names = [item for item in names if re.fullmatch(r'[A-Za-z_$][\w$]*', item)]
        description = ' '.join(purposes.get(name, metadata.get('description', '')).split()).replace('|', '\\|')
        methods = ', '.join(f'`{item}`' for item in names)
        return f"| [{name}](primitives/{name}.md) | {description} | {methods} |"

    output = [MARKER, "", "## Primitives Catalogue", "",
              f"Bundled on {generated} from `{branch}@{revision[:12]}`, including working-tree documentation. "
              "The index combines catalogue entries, package metadata, and documented API names. "
              "Each package link opens its bundled README with usage examples and caveats. "
              "Names are discovery hints; the package documentation and target release establish the contract.", ""]
    for category, rows in categories.items():
        output += [f"### {category}", "", "| Package | Purpose | Primitives |", "| --- | --- | --- |"]
        output += [entry(name, names) for name, names in rows]
        output.append("")
    utility_groups = json.loads((skill / "references/utilities.json").read_text())
    output += ["## Utilities", "", purposes['utils'], "",
               "| Task | Purpose | Import | Utilities |", "| --- | --- | --- | --- |"]
    grouped_exports = set()
    for group in utility_groups:
        methods = ', '.join(f'`{name}`' for name in group['exports'])
        description = ' '.join(group['purpose'].split()).replace('|', '\\|')
        output.append(
            f"| [{group['group']}](primitives/utils.md#{group['anchor']}) "
            f"| {description} | `{group['import']}` | {methods} |"
        )
        grouped_exports.update(group['exports'])
    metadata, readme = packages['utils']
    discovered_exports = set((metadata.get('primitive') or {}).get('list', []) + api_names(readme))
    ungrouped = sorted(discovered_exports - grouped_exports)
    if ungrouped:
        print("Group new utility exports in references/utilities.json: " + ', '.join(ungrouped))
        methods = ', '.join(f'`{name}`' for name in ungrouped)
        output.append(
            "| [Additional utilities](primitives/utils.md) "
            f"| Read the package documentation for usage and import paths. | See documentation | {methods} |"
        )
    output.append("")
    (skill / "references/catalogue.md").write_text("\n".join(output))
    print(f"Bundled {len(packages)} package READMEs and rebuilt the catalogue.")


if __name__ == "__main__":
    main()

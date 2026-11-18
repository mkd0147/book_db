"""Collect installed desktop Python and frontend runtime license metadata/texts.

This does not cover Android native/Java runtimes or every PyInstaller-added
module. The manifest records missing texts; it is not a legal compliance audit.
"""
from importlib import metadata
import json
from pathlib import Path
import re
from packaging.requirements import Requirement

root = Path(__file__).resolve().parents[1]
output = root / 'docs/third-party'
output.mkdir(parents=True, exist_ok=True)
records, sections, seen = [], [], set()
def license_name(path):
    return bool(re.match(r'^(licen[cs]e|copying|notice|copyright)([._-].*)?$', Path(str(path)).name, re.I))
def add(ecosystem, name, version, declared, texts):
    records.append({'ecosystem': ecosystem, 'name': name, 'version': version,
                    'declared_license': declared, 'license_files': [name for name, _ in texts],
                    'license_text_found': bool(texts)})
    sections.append('\n' + '=' * 72 + f'\n{ecosystem}: {name} {version}\nDeclared license: {declared or "Not specified"}\n')
    if not texts:
        sections.append('License text not found in installed distribution; review required.\n')
    for path, content in texts:
        sections.append(f'\n--- {path} ---\n{content}\n')
def python_package(name):
    normalized = re.sub(r'[-_.]+', '-', name).lower()
    if normalized in seen: return
    seen.add(normalized)
    dist = metadata.distribution(name)
    texts = []
    for path in sorted(dist.files or [], key=str):
        if license_name(path):
            file = Path(dist.locate_file(path))
            if file.is_file(): texts.append((str(path), file.read_text(encoding='utf-8', errors='replace')))
    declared = dist.metadata.get('License-Expression') or dist.metadata.get('License') or ''
    add('Python desktop', dist.metadata['Name'], dist.version, declared, texts)
    for value in dist.requires or []:
        dep = Requirement(value)
        if dep.marker is None or dep.marker.evaluate({'extra': ''}): python_package(dep.name)
for line in (root / 'backend/requirements.txt').read_text().splitlines():
    if line.strip() and not line.startswith(('#', '-')): python_package(Requirement(line).name)

npm_seen = set()
def npm_package(name):
    if name in npm_seen: return
    npm_seen.add(name)
    folder = root / 'frontend/node_modules' / name
    info = json.loads((folder / 'package.json').read_text(encoding='utf-8'))
    texts = [(file.name, file.read_text(encoding='utf-8', errors='replace'))
             for file in sorted(folder.iterdir()) if file.is_file() and license_name(file)]
    add('JavaScript runtime', name, info['version'], info.get('license', ''), texts)
    for dep in sorted(info.get('dependencies', {})): npm_package(dep)
for name in sorted(json.loads((root / 'frontend/package.json').read_text())['dependencies']): npm_package(name)

header = ('BookDB third-party notices: installed desktop Python and frontend runtime dependencies.\n'
          'Generated from local package metadata and license files.\n'
          'Android native/Java components and packaging-added modules require separate review.\n')
(output / 'DESKTOP_RUNTIME_NOTICES.txt').write_text(header + ''.join(sections), encoding='utf-8')
(output / 'desktop-runtime-manifest.json').write_text(json.dumps({'scope': 'Installed desktop Python dependency graph and frontend runtime graph',
    'components': records, 'pending': ['Android Python wheel license/version differences', 'Android Java/native runtimes and Google Play services',
                                      'Python interpreter and native linked libraries', 'PyInstaller-added modules and bootloader']}, indent=2)+'\n', encoding='utf-8')
missing = [r['name'] for r in records if not r['license_text_found']]
print(f'Collected notices for {len(records)} runtime packages; {len(missing)} missing license texts.')
if missing: print('Review: ' + ', '.join(missing))

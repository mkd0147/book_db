"""Build a portable folder; no installer or changes to installed browsers."""
import subprocess
import argparse
import sys
import runpy
import shutil
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
if subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=normal'], cwd=root, text=True).strip():
    raise SystemExit('Commit the source before packaging a release.')
version = runpy.run_path(str(root / 'backend/app/version.py'))['APP_VERSION']
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--dist-dir', type=Path, default=root / 'dist', help='Output root; builds go in v<APP_VERSION>/BookDB below it.')
args = parser.parse_args()
release_dir = args.dist_dir.resolve() / f'v{version}'
if release_dir.exists():
    raise SystemExit(f'Release folder already exists: {release_dir}. Bump APP_VERSION before packaging a new release, or choose a separate --dist-dir for a test build.')
if sys.platform != 'win32':
    raise SystemExit('Build the Windows package on Windows.')
subprocess.run([sys.executable, str(root/'scripts/collect_runtime_notices.py')], cwd=root, check=True)
node = shutil.which('node')
if not node:
    raise SystemExit('Node.js is required to package the current interface.')
frontend = root / 'frontend'
subprocess.run([node, str(frontend/'node_modules/typescript/bin/tsc'),
                '--noEmit', '--incremental', 'false'], cwd=frontend, check=True)
(root/'build').mkdir(exist_ok=True)
staging = Path(tempfile.mkdtemp(prefix='windows-package-', dir=root/'build'))
assets = staging/'frontend'
subprocess.run([node, str(frontend/'node_modules/vite/bin/vite.js'), 'build',
                '--configLoader', 'runner', '--outDir', str(assets)], cwd=frontend, check=True)
if not (assets/'index.html').is_file():
    raise SystemExit('Current frontend build is missing; packaging cancelled.')
subprocess.run([
    sys.executable, '-m', 'PyInstaller', '--noconfirm', '--onedir', '--windowed',
    '--name', 'BookDB', '--paths', str(root / 'backend'),
    '--distpath', str(release_dir),
    '--workpath', str(staging/'pyinstaller'), '--specpath', str(staging),
    '--add-data', str(assets) + ';frontend/dist',
    '--add-data', str(root / 'backend/migrations') + ';migrations',
    '--collect-submodules', 'uvicorn', '--collect-submodules', 'alembic',
    str(root / 'launcher.py'),
], cwd=root, check=True)
(release_dir / 'VERSION.txt').write_text(version + '\n', encoding='utf-8')
shutil.copyfile(root / 'docs/WINDOWS_1_9.md', release_dir / 'BookDB' / 'User guide.md')
shutil.copytree(root / 'docs/third-party', release_dir / 'BookDB' / 'Third-party notices')
print(f'Package ready: {release_dir / "BookDB" / "BookDB.exe"}')

commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
(release_dir / 'SOURCE_COMMIT.txt').write_text(commit + '\n', encoding='utf-8')

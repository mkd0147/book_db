"""Start BookDB locally. The browser profile and taskbar are never configured here."""
import argparse
import logging
import os
from pathlib import Path
import socket
import sys
import threading
import webbrowser

ROOT = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent))
sys.path.insert(0, str(ROOT / 'backend'))


def main():
    parser = argparse.ArgumentParser(description='BookDB local launcher')
    parser.add_argument('--port', type=int, default=8769)
    parser.add_argument('--data-dir', type=Path)
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--headless', action='store_true', help='Run only the server, without a launcher window or browser')
    args = parser.parse_args()
    if args.data_dir:
        os.environ['BOOK_DB_DATA_DIR'] = str(args.data_dir.resolve())
    from app.db import database_path
    from app.main import create_app
    from app.version import APP_VERSION
    import httpx
    import uvicorn

    path = database_path()
    logging.basicConfig(filename=path.parent / 'bookdb.log', level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s', encoding='utf-8')
    url = f'http://127.0.0.1:{args.port}'
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    if os.name == 'nt':
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
    try:
        listener.bind(('127.0.0.1', args.port))
        listener.listen(128)
    except OSError:
        listener.close()
        try:
            health = httpx.get(url + '/api/health', timeout=2).json()
            settings = httpx.get(url + '/api/settings', timeout=2).json()
            same = health.get('app') == 'BookDB' and Path(settings['database_path']).resolve() == path.resolve()
        except Exception:
            same = False
        if not same:
            raise RuntimeError(f'Port {args.port} is in use. Close the other application or choose --port with another number.')
        if health.get('version') != APP_VERSION:
            raise RuntimeError('An older BookDB version is still running. Click Stop BookDB in its launcher, then open this version again.')
        if not args.no_browser and not args.headless:
            webbrowser.open(url)
        return

    dist = ROOT / 'frontend' / 'dist'
    if not (dist / 'index.html').exists():
        listener.close()
        raise RuntimeError('Frontend build missing. Run Setup.cmd first.')
    app = create_app(path, static_dir=dist)
    server = uvicorn.Server(uvicorn.Config(app, host='127.0.0.1', port=args.port, log_config=None, access_log=False))
    if args.headless:
        try:
            server.run(sockets=[listener])
        finally:
            listener.close()
        return

    import tkinter as tk
    from tkinter import messagebox
    window = tk.Tk()
    window.title('BookDB')
    window.geometry('430x205')
    window.resizable(False, False)
    status = tk.StringVar(value='Starting your local library…')
    tk.Label(window, text='BookDB', font=('Segoe UI', 22)).pack(pady=(18, 6))
    tk.Label(window, textvariable=status, font=('Segoe UI', 10)).pack()
    tk.Label(window, text=url, font=('Segoe UI', 10)).pack(pady=5)
    buttons = tk.Frame(window)
    buttons.pack(pady=10)
    open_button = tk.Button(buttons, text='Open library', command=lambda: webbrowser.open(url), state='disabled')
    open_button.pack(side='left', padx=6)
    failure = []

    def run():
        try:
            server.run(sockets=[listener])
        except BaseException as error:
            logging.exception('Server failed')
            failure.append(str(error))

    worker = threading.Thread(target=run, daemon=True)
    worker.start()
    stopping = False

    def stop():
        nonlocal stopping
        stopping = True
        status.set('Closing the library…')
        open_button.config(state='disabled')
        server.should_exit = True
        await_stop()

    def await_stop():
        if worker.is_alive():
            window.after(100, await_stop)
        else:
            listener.close()
            window.destroy()

    tk.Button(buttons, text='Stop BookDB', command=stop).pack(side='left', padx=6)
    window.protocol('WM_DELETE_WINDOW', stop)

    def ready():
        if stopping:
            return
        if failure or not worker.is_alive():
            messagebox.showerror('BookDB', 'Could not start. ' + (failure[0] if failure else 'See bookdb.log in the data directory.'))
            stop()
        elif server.started:
            status.set('Your library is running on this computer.')
            open_button.config(state='normal')
            if not args.no_browser:
                webbrowser.open(url)
        else:
            window.after(150, ready)

    window.after(150, ready)
    window.mainloop()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        logging.exception('Launcher failed')
        if '--headless' not in sys.argv:
            import tkinter as tk
            from tkinter import messagebox
            root = tk.Tk()
            root.withdraw()
            messagebox.showerror('BookDB', str(error))
            root.destroy()
        elif sys.stderr:
            print(str(error), file=sys.stderr)
        sys.exit(1)

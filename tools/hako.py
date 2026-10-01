#!/usr/bin/env python3
"""Component-owned operational entry point for hakoniwa-threejs-drone."""

from __future__ import annotations

import argparse
import concurrent.futures
import functools
import http.server
import json
import subprocess
import sys
import threading
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

REQUIRED_FILES = (
    "index.html",
    "src/public/drone_viewer.js",
    "src/index.js",
    "config/viewer-config-legacy.json",
    "config/viewer-config-fleets.json",
    "thirdparty/hakoniwa-pdu-javascript/src/PduManager.js",
    "thirdparty/hakoniwa-pdu-javascript/src/impl/WebSocketCommunicationService.js",
)

SMOKE_PATHS = (
    "/index.html",
    "/config/viewer-config-legacy.json",
    "/src/public/drone_viewer.js",
    "/thirdparty/hakoniwa-pdu-javascript/src/PduManager.js",
)


def _check_required_files() -> list[str]:
    return [path for path in REQUIRED_FILES if not (ROOT / path).is_file()]


def _validate_viewer_configs() -> list[str]:
    errors: list[str] = []
    for path in sorted((ROOT / "config").glob("viewer-config-*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            errors.append(f"{path.relative_to(ROOT)}: cannot load JSON: {exc}")
            continue

        if data.get("version") != "1.0":
            errors.append(f"{path.relative_to(ROOT)}: version must be 1.0")

        mode = data.get("stateInput", {}).get("mode")
        if mode not in {"legacy", "fleets"}:
            errors.append(f"{path.relative_to(ROOT)}: stateInput.mode must be legacy or fleets")

        for key_path in (("three", "sceneConfigPath"), ("pdu", "pduDefPath")):
            value = data
            for key in key_path:
                value = value.get(key) if isinstance(value, dict) else None
            if not isinstance(value, str) or not value:
                errors.append(f"{path.relative_to(ROOT)}: {'.'.join(key_path)} is required")
                continue
            if value.startswith(("http://", "https://", "/")):
                continue
            resolved = (path.parent / value).resolve()
            if not resolved.is_file():
                errors.append(
                    f"{path.relative_to(ROOT)}: {'.'.join(key_path)} target does not exist: {value}"
                )
    return errors


def doctor() -> int:
    errors: list[str] = []
    if sys.version_info < (3, 9):
        errors.append(f"Python 3.9 or later is required; found {sys.version.split()[0]}")

    errors.extend(f"missing required file: {path}" for path in _check_required_files())
    errors.extend(_validate_viewer_configs())

    print(f"repository: {ROOT}")
    print(f"python: {sys.executable} ({sys.version.split()[0]})")
    if errors:
        for message in errors:
            print(f"ERROR: {message}", file=sys.stderr)
        print("doctor: BLOCKED", file=sys.stderr)
        return 1

    print("doctor: READY")
    return 0


def test() -> int:
    command = [
        sys.executable,
        "-m",
        "unittest",
        "discover",
        "-s",
        str(ROOT / "tests"),
        "-p",
        "test_*.py",
        "-v",
    ]
    return subprocess.run(command, cwd=ROOT, check=False).returncode


class ViewerHTTPServer(http.server.ThreadingHTTPServer):
    """A static server for the viewer. Its page loads dozens of ES modules at
    once (more with several viewers open); the standard listen backlog of 5
    resets the connections beyond it (ERR_CONNECTION_RESET: the viewer stops
    with "error"). A long backlog lets them wait their turn."""

    request_queue_size = 128
    daemon_threads = True


class _NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    """Every response fresh (the viewer is edited while it is served)."""

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()


class _QuietHandler(_NoCacheHandler):
    def log_message(self, format: str, *args: object) -> None:  # noqa: A003
        return


def serve(port: int, bind: str) -> int:
    """Serve the viewer (this repository) for a browser."""
    handler = functools.partial(_NoCacheHandler, directory=str(ROOT))
    server = ViewerHTTPServer((bind, port), handler)
    print(f"Serving {ROOT} on http://{bind}:{server.server_address[1]}/index.html (Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


def _modules() -> list[str]:
    """Every ES module the viewer may load (src/ and the PDU JavaScript)."""
    roots = (ROOT / "src", ROOT / "thirdparty" / "hakoniwa-pdu-javascript" / "src")
    return sorted("/" + path.relative_to(ROOT).as_posix() for root in roots for path in root.rglob("*.js"))


def smoke() -> int:
    missing = _check_required_files()
    if missing:
        for path in missing:
            print(f"ERROR: missing required file: {path}", file=sys.stderr)
        return 1

    handler = functools.partial(_QuietHandler, directory=str(ROOT))
    server = ViewerHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    port = server.server_address[1]
    try:
        for path in SMOKE_PATHS:
            url = f"http://127.0.0.1:{port}{path}"
            with urllib.request.urlopen(url, timeout=5) as response:
                payload = response.read()
                if response.status != 200 or not payload:
                    raise RuntimeError(f"unexpected response for {path}: status={response.status}")
            print(f"OK: {path}")
        # Every module at once, as a browser loading the viewer asks for them.
        modules = _modules()

        def fetch(path: str) -> int:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}{path}", timeout=10) as response:
                return response.status

        with concurrent.futures.ThreadPoolExecutor(max_workers=64) as pool:
            statuses = list(pool.map(fetch, modules))
        if any(status != 200 for status in statuses):
            raise RuntimeError("some modules were not served")
        print(f"OK: {len(modules)} modules at once")
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: smoke failed: {exc}", file=sys.stderr)
        return 1
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)

    print("smoke: PASSED")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("doctor", "test", "smoke", "serve"))
    parser.add_argument("--port", type=int, default=8000, help="serve: the port (default 8000)")
    parser.add_argument("--bind", default="127.0.0.1", help="serve: the address (default 127.0.0.1)")
    args = parser.parse_args()

    if args.command == "serve":
        return serve(args.port, args.bind)
    return {
        "doctor": doctor,
        "test": test,
        "smoke": smoke,
    }[args.command]()


if __name__ == "__main__":
    raise SystemExit(main())

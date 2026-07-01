#!/usr/bin/env python3
"""Local development server that mimics static-host 404 behavior.

Netlify, Vercel, GitHub Pages and Cloudflare Pages all auto-serve a root
``404.html`` file when a request doesn't match a real path. Python's stock
``http.server`` does not, so this thin wrapper adds that one behavior
while keeping everything else identical to ``python3 -m http.server``.

Usage:
    python3 serve.py [port]
"""

import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
NOT_FOUND_PAGE = Path(__file__).parent / "404.html"


class NotFoundAwareHandler(SimpleHTTPRequestHandler):
    def send_error(self, code, message=None, explain=None):
        if code == 404 and NOT_FOUND_PAGE.is_file():
            body = NOT_FOUND_PAGE.read_bytes()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().send_error(code, message, explain)


if __name__ == "__main__":
    HTTPServer(("", PORT), NotFoundAwareHandler).serve_forever()

#!/usr/bin/env python3
"""Static preview server dengan charset UTF-8 (emoji & teks Indonesia tampil benar)."""
import http.server
import socketserver

PORT = 5173


class PreviewHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        "": "application/octet-stream",
        ".html": "text/html; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
    }


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), PreviewHandler) as httpd:
        print(f"UI preview: http://localhost:{PORT}/index.html", flush=True)
        httpd.serve_forever()

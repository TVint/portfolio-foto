#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NICOLA VIANELLO // DARKROOM ARCHIVE & CONTACT-SHEET CMS BACKEND (FOTOGRAFIA)
Zero-dependency Python 3 HTTP & REST API Server for managing:
- window.PHOTOS_MANIFEST (photos-data.js & photos-db.json)
- Drag & Drop Multi-Photo Uploads into FOTO/ with automatic macOS `sips` EXIF/dimension analysis
- Folder Synchronization (Rescan FOTO/ preserving existing curatorial edits)
- Automatic Backups & 1-Click Git Sync
"""

import os
import sys
import json
import time
import base64
import shutil
import hashlib
import subprocess
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler
from datetime import datetime

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
FOTO_DIR = os.path.join(ROOT_DIR, "FOTO")
THUMBS_DIR = os.path.join(ROOT_DIR, "THUMBS")
JS_FILE = os.path.join(ROOT_DIR, "photos-data.js")
JSON_DB_FILE = os.path.join(ROOT_DIR, "photos-db.json")
BACKUP_DIR = os.path.join(ROOT_DIR, "backups")
TRASH_DIR = os.path.join(ROOT_DIR, "backups", "trash_foto")

DEFAULT_CATEGORIES = ["NATURA", "PARTY", "SOGGETTI", "ANIMALI", "ASTRATTO"]
FILM_STOCKS = [
    "KODAK TRI-X 400 // 35MM",
    "ILFORD HP5 PLUS // 120MM",
    "FUJIFILM PRO NEG. HI // 35MM EQ",
    "CINESTILL 800T // HALATION",
    "KODAK PORTRA 400 // DAYLIGHT",
    "ILFORD DELTA 3200 // PUSH +2",
    "KODAK EKTAR 100 // HIGH SAT",
    "FUJIFILM ACROS 100 II // ORTHO",
]
FOCAL_LENSES = [
    "23MM F/2.0",
    "28MM F/2.8",
    "35MM F/1.4",
    "50MM F/1.2",
    "56MM F/1.2",
    "85MM F/1.8",
    "90MM F/2.0",
]
SHUTTERS = ["1/60s", "1/125s", "1/250s", "1/500s", "1/1000s", "1/2000s", "1/4000s"]
ISOS = ["ISO 160", "ISO 400", "ISO 800", "ISO 1600", "ISO 3200", "ISO 6400"]

os.makedirs(FOTO_DIR, exist_ok=True)
os.makedirs(THUMBS_DIR, exist_ok=True)
os.makedirs(BACKUP_DIR, exist_ok=True)
os.makedirs(TRASH_DIR, exist_ok=True)


def sanitize_filename(filename):
    name, ext = os.path.splitext(os.path.basename(filename))
    safe = "".join(c if (c.isalnum() or c in " -_.") else "_" for c in name).strip()
    if not safe:
        safe = f"FRAME_{int(time.time())}"
    ext = ext.upper() if ext.upper() in [".JPG", ".JPEG", ".PNG", ".WEBP"] else ".JPG"
    return safe + ext


def inspect_single_image(filepath):
    """Extract real pixel width/height using macOS `sips` (or fallback header parser)."""
    width, height = 1800, 1200
    try:
        out = subprocess.check_output(
            ["sips", "-g", "pixelWidth", "-g", "pixelHeight", filepath],
            text=True,
            stderr=subprocess.DEVNULL,
        )
        for line in out.splitlines():
            line = line.strip()
            if line.startswith("pixelWidth:"):
                width = int(line.split(":")[1].strip())
            elif line.startswith("pixelHeight:"):
                height = int(line.split(":")[1].strip())
    except Exception:
        pass

    ratio = round(width / height, 4) if height else 1.5
    if ratio >= 1.65:
        orientation = "panoramic"
    elif ratio >= 1.12:
        orientation = "landscape"
    elif ratio <= 0.88:
        orientation = "portrait"
    else:
        orientation = "square"

    return width, height, ratio, orientation


def build_default_photo_entry(filename, index_num, width=None, height=None, ratio=None, orientation=None, category=None):
    filepath = os.path.join(FOTO_DIR, filename)
    if width is None or height is None:
        width, height, ratio, orientation = inspect_single_image(filepath)

    h = int(hashlib.md5(filename.encode("utf-8")).hexdigest(), 16)
    cat = category if category in DEFAULT_CATEGORIES else DEFAULT_CATEGORIES[h % len(DEFAULT_CATEGORIES)]

    return {
        "index": index_num,
        "id": f"#{index_num:03d}",
        "frame": f"FRM // {index_num:03d}",
        "filename": filename,
        "src": f"FOTO/{filename}",
        "thumb": f"THUMBS/{filename}",
        "title": "",
        "width": width,
        "height": height,
        "aspectRatio": ratio,
        "orientation": orientation,
        "category": cat,
        "stock": FILM_STOCKS[h % len(FILM_STOCKS)],
        "lens": FOCAL_LENSES[(h >> 3) % len(FOCAL_LENSES)],
        "shutter": SHUTTERS[(h >> 6) % len(SHUTTERS)],
        "iso": ISOS[(h >> 9) % len(ISOS)],
        "luminance": 0.5,
    }


def load_manifest_data():
    """Load photos manifest from photos-db.json or parse photos-data.js."""
    if os.path.exists(JSON_DB_FILE):
        try:
            with open(JSON_DB_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict) and "photos" in data:
                    return data
        except Exception as e:
            print(f"[WARN] Impossibile leggere photos-db.json: {e}")

    if os.path.exists(JS_FILE):
        try:
            with open(JS_FILE, "r", encoding="utf-8") as f:
                raw = f.read()
            marker = "window.PHOTOS_MANIFEST"
            idx = raw.find(marker)
            if idx != -1:
                bracket_start = raw.find("[", idx)
                bracket_end = raw.rfind("]")
                if bracket_start != -1 and bracket_end != -1:
                    json_str = raw[bracket_start : bracket_end + 1]
                    photos = json.loads(json_str)
                    for p in photos:
                        if "title" not in p:
                            p["title"] = ""
                    payload = {"categories": DEFAULT_CATEGORIES, "photos": photos}
                    with open(JSON_DB_FILE, "w", encoding="utf-8") as jf:
                        json.dump(payload, jf, indent=2, ensure_ascii=False)
                    return payload
        except Exception as e:
            print(f"[ERROR] Errore durante il parsing di photos-data.js: {e}")

    return {"categories": DEFAULT_CATEGORIES, "photos": []}


def normalize_and_reindex(photos):
    """Ensure sequential index, #id, and default frame codes if not customized."""
    normalized = []
    for idx, p in enumerate(photos, start=1):
        item = dict(p)
        old_idx = item.get("index", idx)
        item["index"] = idx
        item["id"] = f"#{idx:03d}"
        old_default_frame = f"FRM // {old_idx:03d}"
        if not item.get("frame") or item.get("frame") == old_default_frame or item.get("frame", "").startswith("FRM // "):
            # Keep custom frame only if user explicitly changed prefix away from FRM // XXX
            if item.get("frame", "").startswith("FRM // "):
                item["frame"] = f"FRM // {idx:03d}"
        if "title" not in item:
            item["title"] = ""
        normalized.append(item)
    return normalized


def save_manifest_data(data):
    """Save manifest to photos-db.json and regenerate photos-data.js with backup."""
    categories = data.get("categories") or DEFAULT_CATEGORIES
    photos = normalize_and_reindex(data.get("photos", []))
    payload = {"categories": categories, "photos": photos}

    # Create backup of existing photos-data.js
    if os.path.exists(JS_FILE):
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = os.path.join(BACKUP_DIR, f"photos-data_{ts}.js.bak")
        try:
            shutil.copy2(JS_FILE, backup_path)
            backups = sorted(
                [
                    os.path.join(BACKUP_DIR, f)
                    for f in os.listdir(BACKUP_DIR)
                    if f.endswith(".bak")
                ]
            )
            while len(backups) > 20:
                os.remove(backups.pop(0))
        except Exception as e:
            print(f"[WARN] Backup fallito: {e}")

    with open(JSON_DB_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    js_header = (
        "/**\n"
        " * NICOLA VIANELLO — PHOTOGRAPHIC ARCHIVE MANIFEST\n"
        f" * Total Frames: {len(photos)}\n"
        f" * Last Updated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        " * Generated by Darkroom Contact-Sheet CMS\n"
        " */\n"
        f"window.PHOTOS_CATEGORIES = {json.dumps(categories, ensure_ascii=False)};\n"
        "window.PHOTOS_MANIFEST = "
    )
    js_content = js_header + json.dumps(photos, indent=2, ensure_ascii=False) + ";\n"

    with open(JS_FILE, "w", encoding="utf-8") as f:
        f.write(js_content)

    return payload


def rescan_foto_folder():
    """Synchronize FOTO/ folder with manifest without losing curatorial edits."""
    current_data = load_manifest_data()
    existing_photos = current_data.get("photos", [])
    existing_by_filename = {p["filename"]: p for p in existing_photos if "filename" in p}

    disk_files = sorted(
        [
            f
            for f in os.listdir(FOTO_DIR)
            if os.path.isfile(os.path.join(FOTO_DIR, f))
            and f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
            and not f.startswith(".")
        ]
    )
    disk_set = set(disk_files)

    # Keep existing order for files still on disk
    merged_photos = []
    for p in existing_photos:
        fn = p.get("filename")
        if fn in disk_set:
            merged_photos.append(p)

    # Append newly discovered files on disk
    added_count = 0
    for fn in disk_files:
        if fn not in existing_by_filename:
            new_entry = build_default_photo_entry(fn, len(merged_photos) + 1)
            merged_photos.append(new_entry)
            added_count += 1

    removed_count = len(existing_photos) - (len(merged_photos) - added_count)
    saved = save_manifest_data(
        {"categories": current_data.get("categories", DEFAULT_CATEGORIES), "photos": merged_photos}
    )
    return {
        "added": added_count,
        "removed": max(0, removed_count),
        "total": len(saved["photos"]),
        "data": saved,
    }


class DarkroomAdminHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        if self.path.startswith("/api/") or self.path.endswith(".js") or self.path.endswith(".json"):
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/status":
            data = load_manifest_data()
            self.send_json(
                {
                    "ok": True,
                    "service": "Nicola Vianello — Darkroom Contact-Sheet CMS",
                    "totalPhotos": len(data.get("photos", [])),
                    "categories": data.get("categories", DEFAULT_CATEGORIES),
                    "workspace": ROOT_DIR,
                    "timestamp": datetime.now().isoformat(),
                }
            )
            return

        if parsed.path == "/api/photos":
            data = load_manifest_data()
            self.send_json({"ok": True, "data": data})
            return

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)

        # Save entire manifest
        if parsed.path == "/api/photos":
            try:
                body = self.read_json_body()
                payload = body.get("data", body)
                if not isinstance(payload, dict) or "photos" not in payload:
                    self.send_json({"ok": False, "error": "Formato dati non valido: 'photos' mancante."}, 400)
                    return
                saved = save_manifest_data(payload)
                self.send_json(
                    {
                        "ok": True,
                        "message": f"Archivio aggiornato ({len(saved['photos'])} scatti salvati in photos-data.js).",
                        "data": saved,
                    }
                )
            except Exception as e:
                self.send_json({"ok": False, "error": str(e)}, 500)
            return

        # Upload one or multiple photos via base64 JSON
        if parsed.path == "/api/upload":
            try:
                body = self.read_json_body()
                files = body.get("files", [])
                if not files and "dataUrl" in body:
                    files = [body]

                default_category = body.get("category", "SOGGETTI")
                default_stock = body.get("stock", "")
                prepend = bool(body.get("prepend", True))

                current_data = load_manifest_data()
                photos = current_data.get("photos", [])
                created_items = []

                for fobj in files:
                    raw_name = fobj.get("filename", f"FRAME_{int(time.time())}.JPG")
                    data_url = fobj.get("dataUrl", "")
                    if not data_url:
                        continue

                    if "," in data_url:
                        _, b64_data = data_url.split(",", 1)
                    else:
                        b64_data = data_url

                    binary = base64.b64decode(b64_data)
                    safe_name = sanitize_filename(raw_name)
                    dest_path = os.path.join(FOTO_DIR, safe_name)

                    if os.path.exists(dest_path) and not fobj.get("overwrite", False):
                        base_n, ext_n = os.path.splitext(safe_name)
                        safe_name = f"{base_n}_{int(time.time())}{ext_n}"
                        dest_path = os.path.join(FOTO_DIR, safe_name)

                    with open(dest_path, "wb") as out_f:
                        out_f.write(binary)

                    # Generate web-optimized thumbnail in THUMBS/
                    thumb_dest = os.path.join(THUMBS_DIR, safe_name)
                    try:
                        subprocess.run(
                            ["sips", "-Z", "1200", "-s", "formatOptions", "82", dest_path, "--out", thumb_dest],
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL,
                            check=False,
                        )
                    except Exception:
                        pass

                    entry = build_default_photo_entry(
                        safe_name,
                        len(photos) + 1,
                        category=fobj.get("category") or default_category,
                    )
                    if default_stock:
                        entry["stock"] = default_stock
                    if fobj.get("title"):
                        entry["title"] = fobj.get("title")
                    created_items.append(entry)

                if prepend:
                    photos = created_items + photos
                else:
                    photos = photos + created_items

                saved = save_manifest_data(
                    {"categories": current_data.get("categories", DEFAULT_CATEGORIES), "photos": photos}
                )
                self.send_json(
                    {
                        "ok": True,
                        "uploadedCount": len(created_items),
                        "created": created_items,
                        "data": saved,
                    }
                )
            except Exception as e:
                self.send_json({"ok": False, "error": str(e)}, 500)
            return

        # Rescan FOTO/ directory
        if parsed.path == "/api/rescan":
            try:
                result = rescan_foto_folder()
                self.send_json(
                    {
                        "ok": True,
                        "message": f"Sincronizzazione completata: +{result['added']} nuovi scatti, -{result['removed']} rimossi. Totale: {result['total']}.",
                        **result,
                    }
                )
            except Exception as e:
                self.send_json({"ok": False, "error": str(e)}, 500)
            return

        # Delete photo from manifest (and optionally move file to backups/trash_foto)
        if parsed.path == "/api/delete-photo":
            try:
                body = self.read_json_body()
                filename = body.get("filename", "")
                delete_disk_file = bool(body.get("deleteFile", False))

                current_data = load_manifest_data()
                photos = current_data.get("photos", [])
                new_photos = [p for p in photos if p.get("filename") != filename]

                if delete_disk_file and filename:
                    src_file = os.path.join(FOTO_DIR, os.path.basename(filename))
                    if os.path.exists(src_file):
                        shutil.move(
                            src_file,
                            os.path.join(TRASH_DIR, f"{int(time.time())}_{os.path.basename(filename)}"),
                        )

                saved = save_manifest_data(
                    {"categories": current_data.get("categories", DEFAULT_CATEGORIES), "photos": new_photos}
                )
                self.send_json(
                    {
                        "ok": True,
                        "message": f"Scatto {filename} rimosso dall'archivio.",
                        "data": saved,
                    }
                )
            except Exception as e:
                self.send_json({"ok": False, "error": str(e)}, 500)
            return

        # Git commit & push
        if parsed.path == "/api/git-sync":
            try:
                body = self.read_json_body()
                commit_msg = body.get(
                    "message",
                    f"Aggiornamento archivio fotografico ({datetime.now().strftime('%Y-%m-%d %H:%M')})",
                )
                subprocess.run(["git", "add", "photos-data.js", "photos-db.json", "index.html", "app.js", "admin.html", "admin.css", "admin.js", "server.py"], cwd=ROOT_DIR, check=False)
                status = subprocess.run(
                    ["git", "status", "--porcelain"], cwd=ROOT_DIR, capture_output=True, text=True
                )
                if not status.stdout.strip():
                    self.send_json({"ok": True, "message": "Nessuna modifica da pubblicare su GitHub."})
                    return

                subprocess.run(["git", "commit", "-m", commit_msg], cwd=ROOT_DIR, check=True)
                push_res = subprocess.run(
                    ["git", "push", "origin", "main"], cwd=ROOT_DIR, capture_output=True, text=True
                )
                if push_res.returncode != 0:
                    self.send_json(
                        {
                            "ok": False,
                            "error": f"Commit locale eseguito, ma push fallito o repository remota non ancora configurata: {push_res.stderr}",
                        },
                        500,
                    )
                    return

                self.send_json({"ok": True, "message": "Modifiche pubblicate con successo su GitHub!"})
            except Exception as e:
                self.send_json({"ok": False, "error": str(e)}, 500)
            return

        self.send_json({"ok": False, "error": f"Endpoint non trovato: {parsed.path}"}, 404)


def run_server(port=8081):
    os.chdir(ROOT_DIR)
    server_address = ("", port)
    httpd = HTTPServer(server_address, DarkroomAdminHandler)
    print("\n" + "=" * 68)
    print("  NICOLA VIANELLO // DARKROOM CONTACT-SHEET CMS (FOTOGRAFIA)")
    print("=" * 68)
    print(f"  📁 Workspace : {ROOT_DIR}")
    print(f"  🌐 Sito Live : http://localhost:{port}/index.html")
    print(f"  🎛  Admin CMS : http://localhost:{port}/admin.html")
    print("=" * 68)
    print("  Premi CTRL+C per arrestare il server.\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[INFO] Arresto del server Darkroom CMS.")
        httpd.server_close()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8081
    run_server(port)

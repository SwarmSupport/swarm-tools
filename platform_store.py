"""SQLite storage for user-created site pages and added domains."""

import json
import re
import sqlite3
import sys
import uuid
from pathlib import Path


PRESET_IDS = {"discord", "duckduckgo", "facebook", "instagram", "pixiv", "steam", "twitch", "x"}
PRESET_NAMES = {"discord", "duckduckgo", "facebook", "instagram", "pixiv", "steam", "twitch", "x"}
LABEL = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")


def validate_name(value):
    if not isinstance(value, str):
        raise ValueError("Enter a platform name.")
    name = value.strip()
    if not name or len(name) > 50 or any(ord(char) < 32 for char in name):
        raise ValueError("Platform names must be 1–50 visible characters.")
    if name.casefold() in PRESET_NAMES:
        raise ValueError("That platform already exists.")
    return name


def validate_domain(value):
    if not isinstance(value, str):
        raise ValueError("Enter a domain name.")
    domain = value.strip().lower().rstrip(".")
    parts = domain.split(".")
    if len(domain) > 253 or len(parts) < 2 or not all(LABEL.fullmatch(part) for part in parts):
        raise ValueError("Enter a bare domain such as example.com, without a scheme or wildcard.")
    return domain


def run(operation, database_path, data):
    path = Path(database_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as db:
        db.execute("PRAGMA foreign_keys = ON")
        db.execute("CREATE TABLE IF NOT EXISTS platforms (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE)")
        db.execute("CREATE TABLE IF NOT EXISTS domains (platform_id TEXT NOT NULL, domain TEXT NOT NULL, PRIMARY KEY (platform_id, domain))")
        if operation == "list":
            platforms = [{"id": row[0], "name": row[1]} for row in db.execute("SELECT id, name FROM platforms ORDER BY name COLLATE NOCASE")]
            domains = {}
            for platform_id, domain in db.execute("SELECT platform_id, domain FROM domains ORDER BY domain"):
                domains.setdefault(platform_id, []).append(domain)
            return {"platforms": platforms, "domains": domains}
        if operation == "add_platform":
            name = validate_name(data.get("name"))
            platform_id = f"custom-{uuid.uuid4().hex}"
            try:
                db.execute("INSERT INTO platforms (id, name) VALUES (?, ?)", (platform_id, name))
            except sqlite3.IntegrityError as error:
                raise ValueError("That platform already exists.") from error
            return {"id": platform_id, "name": name}
        if operation == "add_domain":
            platform_id = data.get("platformId")
            if not isinstance(platform_id, str) or (platform_id not in PRESET_IDS and not db.execute("SELECT 1 FROM platforms WHERE id = ?", (platform_id,)).fetchone()):
                raise ValueError("Choose an existing platform.")
            domain = validate_domain(data.get("domain"))
            try:
                db.execute("INSERT INTO domains (platform_id, domain) VALUES (?, ?)", (platform_id, domain))
            except sqlite3.IntegrityError as error:
                raise ValueError("That domain is already on this platform.") from error
            return {"platformId": platform_id, "domain": domain}
        if operation == "remove_domain":
            platform_id = data.get("platformId")
            if not isinstance(platform_id, str) or (platform_id not in PRESET_IDS and not db.execute("SELECT 1 FROM platforms WHERE id = ?", (platform_id,)).fetchone()):
                raise ValueError("Choose an existing platform.")
            domain = validate_domain(data.get("domain"))
            deleted = db.execute("DELETE FROM domains WHERE platform_id = ? AND domain = ?", (platform_id, domain))
            if deleted.rowcount != 1:
                raise ValueError("Only self-added domains can be removed.")
            return {"platformId": platform_id, "domain": domain}
        raise ValueError("Unknown platform storage operation.")


if __name__ == "__main__":
    try:
        payload = json.load(sys.stdin) if not sys.stdin.isatty() else {}
        print(json.dumps(run(sys.argv[1], sys.argv[2], payload)))
    except (ValueError, sqlite3.Error, IndexError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)

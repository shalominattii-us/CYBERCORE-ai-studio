#!/usr/bin/env python3
"""Research-only Stardusk adapter (Contract v1.0). Never executes actions from decisions."""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from urllib.parse import urlparse


def rpc(origin: str, token: str, procedure: str, value: dict) -> dict:
    parsed = urlparse(origin)
    if (
        parsed.scheme != "https"
        or not parsed.netloc
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError(
            "STARDUSK_ORIGIN must be an HTTPS app origin, without credentials, query or fragment."
        )
    if parsed.path not in ("", "/"):
        raise ValueError("Use the app origin only, not a /api path.")
    if not token.startswith("sdk_"):
        raise ValueError(
            "Set STARDUSK_MODULE_TOKEN to a scoped sdk_ module token created by the workspace owner."
        )
    body = json.dumps({"json": value}, separators=(",", ":")).encode()
    if len(body) > 260000:
        raise ValueError("Request is too large. Send smaller batches.")
    req = urllib.request.Request(
        origin.rstrip("/") + "/api/rpc/research/" + procedure,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token,
        },
        method="POST",
    )

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None

    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=30) as response:
            result = json.load(response)
            return result["json"]
    except urllib.error.HTTPError as exc:
        try:
            error = json.loads(exc.read(8192)).get("json", {})
            message = error.get("message", "Request rejected")
        except (ValueError, AttributeError):
            message = "Request rejected; check HTTPS app origin and token."
        raise RuntimeError(f"HTTP {exc.code}: {message}") from None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    ingest = sub.add_parser("ingest", help="Submit a version 1.0 research JSON file")
    ingest.add_argument("file")
    read = sub.add_parser(
        "decisions", help="Read internal human decisions; does not execute them"
    )
    read.add_argument("--module-id", default="sovereign.research.orbital")
    read.add_argument(
        "--cursor-file",
        help="Read an existing cursor file and advance it only after output succeeds",
    )
    read.add_argument(
        "--limit", type=int, default=50, choices=range(1, 101), metavar="1..100"
    )
    args = parser.parse_args()
    origin = os.environ.get("STARDUSK_ORIGIN", "https://stardusk.aegentixcybernetics.com")
    token = os.environ.get("STARDUSK_MODULE_TOKEN", "")
    if args.command == "ingest":
        if os.path.getsize(args.file) > 250000:
            raise ValueError("Maximum brief file size is 250 KB.")
        with open(args.file, encoding="utf-8") as f:
            value = json.load(f)
        result = rpc(origin, token, "ingest", value)
    else:
        value = {"moduleId": args.module_id, "limit": args.limit}
        if args.cursor_file and os.path.exists(args.cursor_file):
            with open(args.cursor_file, encoding="utf-8") as f:
                cursor = json.load(f)
            if cursor:
                value["cursor"] = cursor
        result = rpc(origin, token, "decisions", value)
    print(json.dumps(result, indent=2))
    if args.command == "decisions" and args.cursor_file:
        tmp = args.cursor_file + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(result.get("nextCursor"), f)
        os.replace(tmp, args.cursor_file)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, OSError, KeyError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)

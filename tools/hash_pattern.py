#!/usr/bin/env python3
"""Hash a lock-screen pattern for assets/lock.js.

Dots are numbered 1-9 left to right, top to bottom:

    1 2 3
    4 5 6
    7 8 9

The hash is SHA-256 (hex) of the pattern joined with hyphens, e.g. 1-4-7-8-9.
Only the hash is stored in the page (obfuscation, not real security).

Usage:
    python3 tools/hash_pattern.py 1-4-7-8-9
    python3 tools/hash_pattern.py 1 4 7 8 9

Paste the printed hex into PATTERN_HASH in assets/lock.js.
The default site pattern is the L-shape 1-4-7-8-9.
"""
import hashlib
import re
import sys


def normalize(args):
    raw = " ".join(args).replace(",", " ").replace("-", " ")
    parts = [p for p in re.split(r"\s+", raw.strip()) if p]
    if not parts:
        raise SystemExit("usage: hash_pattern.py 1-4-7-8-9")
    dots = []
    for p in parts:
        if not p.isdigit() or not (1 <= int(p) <= 9):
            raise SystemExit("dots must be integers 1-9, got %r" % p)
        dots.append(str(int(p)))
    if len(dots) < 4:
        raise SystemExit("use at least 4 dots (Android-style)")
    if len(set(dots)) != len(dots):
        raise SystemExit("dots must not repeat")
    return "-".join(dots)


def main(argv=None):
    pattern = normalize(argv if argv is not None else sys.argv[1:])
    digest = hashlib.sha256(pattern.encode("utf-8")).hexdigest()
    print(pattern)
    print(digest)
    print("Paste into assets/lock.js:")
    print('  const PATTERN_HASH = "%s";' % digest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

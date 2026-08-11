#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV = ROOT / 'backend/src/config/env.ts'
text = ENV.read_text(encoding='utf-8')

if 'GOOGLE_PLACES_ENABLED:' not in text:
    anchor = "    GOOGLE_BUSINESS_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),\n"
    if anchor not in text:
        raise SystemExit('P22 recovery: current GOOGLE_BUSINESS_TIMEOUT_MS anchor not found')
    addition = (
        anchor
        + "\n    GOOGLE_PLACES_ENABLED: booleanFromString.default(false),\n"
        + "    GOOGLE_PLACES_API_KEY: z.string().trim().default(''),\n"
        + "    GOOGLE_PLACES_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),\n"
    )
    text = text.replace(anchor, addition, 1)
    ENV.write_text(text, encoding='utf-8')
    print('patched current Google Places env contract')
else:
    print('Google Places env contract already present')

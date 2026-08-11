#!/usr/bin/env python3
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
subprocess.run(['python3', str(ROOT / 'scripts/p25-integrate.py')], check=True)
subprocess.run(['python3', str(ROOT / 'scripts/p25-type-fix.py')], check=True)

service = ROOT / 'backend/src/modules/ask-shield/ask-shield.service.ts'
text = service.read_text(encoding='utf-8')
old = "status: { notIn: ['DONE', 'ARCHIVED'] }"
new = "status: { notIn: ['DONE', 'CANCELED'] }"
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('P25 overdue-task status anchor not found')
service.write_text(text, encoding='utf-8')
print('P25 backend reconciled; canceled tasks excluded from overdue count')

from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'backend/src/modules/company/company.service.ts'
text = path.read_text(encoding='utf-8')
old = "    if (!['mock', 'webhook', 'dadata', 'fns_npd'].includes(String(payload.provider || ''))) return null;"
new = "    if (payload.provider !== 'mock' && payload.provider !== 'webhook' && payload.provider !== 'dadata' && payload.provider !== 'fns_npd') return null;"
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise RuntimeError('provider narrowing anchor not found')
path.write_text(text, encoding='utf-8')
print('backend evidence provider narrowing fixed')

#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'src/features/listings/ListingHealthWorkspace.jsx'
text = path.read_text(encoding='utf-8')
old = "  const locations = overview?.items ?? [];\n  const selected = useMemo(() => locations.find((item) => item.id === selectedId) ?? locations[0] ?? null, [locations, selectedId]);"
new = "  const locations = useMemo(() => overview?.items ?? [], [overview?.items]);\n  const selected = useMemo(() => locations.find((item) => item.id === selectedId) ?? locations[0] ?? null, [locations, selectedId]);"
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('Location Health locations memo anchor not found')
path.write_text(text, encoding='utf-8')
print('Location Health locations selector is stable')

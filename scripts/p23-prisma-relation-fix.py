#!/usr/bin/env python3
from pathlib import Path

schema = Path(__file__).resolve().parents[1] / 'backend/prisma/schema.prisma'
text = schema.read_text(encoding='utf-8')
if '  aiVisibilityMentions AiVisibilityCompetitor[]\n' not in text:
    anchor = '  locations    CompetitiveLocation[]\n'
    if anchor not in text:
        raise SystemExit('CompetitiveCompetitor locations anchor not found')
    text = text.replace(anchor, anchor + '  aiVisibilityMentions AiVisibilityCompetitor[]\n', 1)
    schema.write_text(text, encoding='utf-8')
    print('Added CompetitiveCompetitor.aiVisibilityMentions reverse relation')
else:
    print('Reverse relation already present')

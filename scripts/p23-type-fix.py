#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'backend/src/modules/ai-visibility/ai-visibility.service.ts'
text = path.read_text(encoding='utf-8')
old_import = "import type { PrismaClient } from '../../generated/prisma/client.js';"
new_import = "import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';"
if old_import in text:
    text = text.replace(old_import, new_import, 1)
old_sig = "async function audit(app: FastifyInstance, context: ActorContext, action: string, entityId: string, metadata?: Record<string, unknown>) {"
new_sig = "async function audit(app: FastifyInstance, context: ActorContext, action: string, entityId: string, metadata?: Prisma.InputJsonValue) {"
if old_sig in text:
    text = text.replace(old_sig, new_sig, 1)
if new_import not in text or new_sig not in text:
    raise SystemExit('P23 strict JSON type fix did not reach expected state')
path.write_text(text, encoding='utf-8')
print('P23 audit metadata now uses Prisma.InputJsonValue')

import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env } from '../config/env.js';
import { redactPii } from '../modules/ai/privacy/pii-redaction.js';

const outputPath = resolve(process.argv[2] || './artifacts/ai-training/reply-copilot-human.jsonl');
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

try {
  const replies = await prisma.reviewReply.findMany({
    where: {
      status: 'PUBLISHED',
      origin: 'HUMAN',
      text: { not: '' },
      review: { text: { not: '' } },
    },
    orderBy: { publishedAt: 'asc' },
    select: {
      id: true,
      text: true,
      publishedAt: true,
      review: {
        select: {
          id: true,
          rating: true,
          text: true,
          language: true,
          business: { select: { name: true, industry: true } },
          location: { select: { name: true, city: true, countryCode: true } },
          source: { select: { provider: true } },
        },
      },
    },
  });

  const rows = replies.flatMap((reply) => {
    const review = redactPii(reply.review.text);
    const answer = redactPii(reply.text);
    if (!review.text.trim() || !answer.text.trim()) return [];

    return [JSON.stringify({
      schemaVersion: 1,
      task: 'reply_copilot',
      provenance: {
        replyId: reply.id,
        reviewId: reply.review.id,
        source: 'published_human_reply',
        publishedAt: reply.publishedAt?.toISOString() ?? null,
      },
      input: {
        rating: reply.review.rating,
        reviewText: review.text,
        language: reply.review.language,
        provider: reply.review.source.provider,
        business: {
          name: reply.review.business.name,
          industry: reply.review.business.industry,
          locationName: reply.review.location?.name ?? null,
          city: reply.review.location?.city ?? null,
          countryCode: reply.review.location?.countryCode ?? null,
        },
      },
      output: {
        reply: answer.text,
      },
      privacy: {
        reviewPiiRedactions: review.redactions.length,
        replyPiiRedactions: answer.redactions.length,
      },
    })];
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, rows.length ? rows.join('\n') + '\n' : '', { mode: 0o600 });
  console.log(JSON.stringify({
    outputPath,
    examples: rows.length,
    source: 'published HUMAN replies only',
    piiRedaction: true,
  }, null, 2));
} finally {
  await prisma.$disconnect();
}

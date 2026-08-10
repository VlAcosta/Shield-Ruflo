import fs from 'node:fs';

function replaceExact(path, before, after) {
  const source = fs.readFileSync(path, 'utf8');
  const occurrences = source.split(before).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${path}: expected exactly one match, found ${occurrences}`);
  }
  fs.writeFileSync(path, source.replace(before, after));
}

replaceExact(
  'backend/src/modules/integrations/review-ingestion.service.ts',
  `function metadataSyncMarker(value: unknown): { runId?: string; disposition?: IngestionDisposition } {
  const metadata = jsonObject(value);
  const sync = jsonObject(metadata.providerSync);
  const disposition = sync.disposition;
  return {
    runId: typeof sync.runId === 'string' ? sync.runId : undefined,
    disposition: ['imported', 'updated', 'skipped'].includes(String(disposition))
      ? disposition as IngestionDisposition
      : undefined,
  };
}`,
  `function metadataSyncMarker(value: unknown): { runId?: string; disposition?: IngestionDisposition } {
  const metadata = jsonObject(value);
  const sync = jsonObject(metadata.providerSync);
  const disposition = sync.disposition;
  const marker: { runId?: string; disposition?: IngestionDisposition } = {};
  if (typeof sync.runId === 'string') marker.runId = sync.runId;
  if (['imported', 'updated', 'skipped'].includes(String(disposition))) {
    marker.disposition = disposition as IngestionDisposition;
  }
  return marker;
}`,
);

replaceExact(
  'backend/src/modules/integrations/review-ingestion.service.ts',
  `        try {
          const result = await ingestReviewRecord(
            prisma,
            syncAccount,
            run.id,
            business.id,
            selectedProviderLocationCount(account.configuration),
            record,
          );
          touchedSourceIds.add(result.sourceId);
          if (result.disposition === 'imported') counters.imported += 1;
          else if (result.disposition === 'updated') counters.updated += 1;
          else counters.skipped += 1;
        } catch {
          counters.errors += 1;
        }`,
  `        const result = await ingestReviewRecord(
          prisma,
          syncAccount,
          run.id,
          business.id,
          selectedProviderLocationCount(account.configuration),
          record,
        );
        touchedSourceIds.add(result.sourceId);
        if (result.disposition === 'imported') counters.imported += 1;
        else if (result.disposition === 'updated') counters.updated += 1;
        else counters.skipped += 1;`,
);

replaceExact(
  'src/features/integrations/GoogleBusinessProfile/GoogleBusinessProfileSetup.test.jsx',
  `import { fireEvent, render, screen, waitFor } from '@testing-library/react';`,
  `import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';`,
);

replaceExact(
  'src/features/integrations/GoogleBusinessProfile/GoogleBusinessProfileSetup.test.jsx',
  `    await waitFor(() => expect(screen.getByText('Синхронизировано')).toBeInTheDocument());
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('11')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();`,
  `    const syncLabels = await screen.findAllByText('Синхронизировано');
    const syncPanel = syncLabels.map((node) => node.closest('.google-business-setup__sync')).find(Boolean);
    expect(syncPanel).toBeTruthy();
    expect(within(syncPanel).getByText('7')).toBeInTheDocument();
    expect(within(syncPanel).getByText('2')).toBeInTheDocument();
    expect(within(syncPanel).getByText('11')).toBeInTheDocument();
    expect(within(syncPanel).getByText('0')).toBeInTheDocument();`,
);

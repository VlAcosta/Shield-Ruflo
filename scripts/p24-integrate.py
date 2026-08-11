#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def model_block(text: str, model: str):
    start = text.find(f'model {model} {{')
    if start < 0:
        raise SystemExit(f'Prisma model {model} not found')
    end = text.find('\n}', start)
    if end < 0:
        raise SystemExit(f'Prisma model {model} closing brace not found')
    return start, end

def inject_model_line(text: str, model: str, line: str):
    start, end = model_block(text, model)
    block = text[start:end]
    if line.strip() in block:
        return text
    return text[:end] + '\n' + line + text[end:]

schema_path = ROOT / 'backend/prisma/schema.prisma'
schema = schema_path.read_text(encoding='utf-8')
if 'model ListingSource {' not in schema:
    # Canonical location fields introduced by P24 migration.
    start, end = model_block(schema, 'Location')
    block = schema[start:end]
    marker = '  timezone     String?        @db.VarChar(80)\n'
    if '  phone        String?' not in block:
        if marker not in block:
            raise SystemExit('Location timezone anchor not found')
        addition = marker + (
            '  phone        String?        @db.VarChar(64)\n'
            '  website      String?        @db.Text\n'
            '  regularHours Json?          @map("regular_hours")\n'
            '  categories   Json?\n'
            '  attributes   Json?\n'
            '  images       Json?\n'
        )
        schema = schema[:start] + block.replace(marker, addition, 1) + schema[end:]

    schema = inject_model_line(schema, 'Organization', '  listingSources           ListingSource[]\n  listingSnapshots         ListingSnapshot[]\n  listingHealthIssues      ListingHealthIssue[]')
    schema = inject_model_line(schema, 'Location', '  listingSources ListingSource[]\n  listingSnapshots ListingSnapshot[]\n  listingHealthIssues ListingHealthIssue[]')
    schema = inject_model_line(schema, 'IntegrationAccount', '  listingSources ListingSource[]')

    schema += r'''

enum ListingSourceStatus {
  ACTIVE
  DEGRADED
  ERROR
  DISABLED

  @@map("listing_source_status")
}

enum ListingIssueSeverity {
  INFO
  WARNING
  CRITICAL

  @@map("listing_issue_severity")
}

enum ListingIssueType {
  MISSING
  MISMATCH
  STALE
  DUPLICATE
  UNMAPPED

  @@map("listing_issue_type")
}

model ListingSource {
  id                   String              @id @default(uuid()) @db.Uuid
  organizationId       String              @map("organization_id") @db.Uuid
  locationId           String              @map("location_id") @db.Uuid
  integrationAccountId String              @map("integration_account_id") @db.Uuid
  provider             String              @db.VarChar(80)
  externalLocationId   String              @map("external_location_id") @db.VarChar(240)
  status               ListingSourceStatus @default(ACTIVE)
  lastSyncedAt         DateTime?           @map("last_synced_at")
  lastErrorCode        String?             @map("last_error_code") @db.VarChar(160)
  lastErrorMessage     String?             @map("last_error_message") @db.Text
  createdAt            DateTime            @default(now()) @map("created_at")
  updatedAt            DateTime            @updatedAt @map("updated_at")

  organization       Organization       @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  location           Location           @relation(fields: [locationId], references: [id], onDelete: Cascade)
  integrationAccount IntegrationAccount @relation(fields: [integrationAccountId], references: [id], onDelete: Cascade)
  snapshots          ListingSnapshot[]

  @@unique([locationId, provider], map: "listing_sources_location_provider_key")
  @@unique([integrationAccountId, externalLocationId], map: "listing_sources_account_external_key")
  @@index([organizationId, status, updatedAt], map: "listing_sources_org_status_idx")
  @@map("listing_sources")
}

model ListingSnapshot {
  id                String   @id @default(uuid()) @db.Uuid
  organizationId    String   @map("organization_id") @db.Uuid
  locationId        String   @map("location_id") @db.Uuid
  sourceId          String   @map("source_id") @db.Uuid
  observedAt        DateTime @default(now()) @map("observed_at")
  providerUpdatedAt DateTime? @map("provider_updated_at")
  normalized        Json
  raw               Json?
  healthScore       Int      @map("health_score")
  scoreVersion      Int      @default(1) @map("score_version")
  createdAt         DateTime @default(now()) @map("created_at")

  organization Organization         @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  location     Location             @relation(fields: [locationId], references: [id], onDelete: Cascade)
  source       ListingSource        @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  issues       ListingHealthIssue[]

  @@index([sourceId, observedAt], map: "listing_snapshots_source_observed_idx")
  @@index([locationId, observedAt], map: "listing_snapshots_location_observed_idx")
  @@map("listing_snapshots")
}

model ListingHealthIssue {
  id             String               @id @default(uuid()) @db.Uuid
  organizationId String               @map("organization_id") @db.Uuid
  locationId     String               @map("location_id") @db.Uuid
  snapshotId     String               @map("snapshot_id") @db.Uuid
  type           ListingIssueType
  severity       ListingIssueSeverity
  field          String               @db.VarChar(80)
  expected       Json?
  observed       Json?
  explanation    String               @db.Text
  createdAt      DateTime             @default(now()) @map("created_at")

  organization Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  location     Location        @relation(fields: [locationId], references: [id], onDelete: Cascade)
  snapshot     ListingSnapshot @relation(fields: [snapshotId], references: [id], onDelete: Cascade)

  @@index([locationId, severity, createdAt], map: "listing_health_issues_location_severity_idx")
  @@index([snapshotId], map: "listing_health_issues_snapshot_idx")
  @@map("listing_health_issues")
}
'''
    schema_path.write_text(schema, encoding='utf-8')
    print('P24 Prisma models integrated')
else:
    print('P24 Prisma models already integrated')

# App route registration.
app_path = ROOT / 'backend/src/app.ts'
app = app_path.read_text(encoding='utf-8')
if "listingHealthRoutes" not in app:
    anchor = "import { aiVisibilityRoutes } from './modules/ai-visibility/ai-visibility.routes.js';\n"
    if anchor not in app: raise SystemExit('app aiVisibility import anchor missing')
    app = app.replace(anchor, anchor + "import { listingHealthRoutes } from './modules/listings/listing-health.routes.js';\n", 1)
    register_anchor = "  await app.register(aiVisibilityRoutes, { prefix: '/api/v1' });\n"
    if register_anchor not in app: raise SystemExit('app aiVisibility registration anchor missing')
    app = app.replace(register_anchor, register_anchor + "  await app.register(listingHealthRoutes, { prefix: '/api/v1' });\n", 1)
    app_path.write_text(app, encoding='utf-8')
    print('P24 app route integrated')

# Worker support.
worker_path = ROOT / 'backend/src/worker.ts'
worker = worker_path.read_text(encoding='utf-8')
if 'processListingSyncJob' not in worker:
    import_anchor = "import { processVisibilityRunJob } from './modules/ai-visibility/ai-visibility.service.js';\n"
    if import_anchor not in worker: raise SystemExit('worker P23 import anchor missing')
    worker = worker.replace(import_anchor, import_anchor + "import { processListingSyncJob } from './modules/listings/listing-health.service.js';\n", 1)
    job_anchor = "  if (job.type === 'aiVisibility.run') {"
    pos = worker.find(job_anchor)
    if pos < 0: raise SystemExit('worker aiVisibility job anchor missing')
    next_anchor = "  if (job.type === 'provider.publishReply' || job.type === 'provider.reconcileReply') {"
    next_pos = worker.find(next_anchor, pos)
    if next_pos < 0: raise SystemExit('worker provider reply anchor missing')
    block = "  if (job.type === 'listing.sync') {\n    const organizationId = String(job.payload?.organizationId || '');\n    const sourceId = String(job.payload?.sourceId || '');\n    if (!organizationId || !sourceId) throw new Error('INVALID_LISTING_SYNC_JOB');\n    return processListingSyncJob(prisma, { organizationId, sourceId });\n  }\n"
    worker = worker[:next_pos] + block + worker[next_pos:]
    worker_path.write_text(worker, encoding='utf-8')
    print('P24 worker integrated')

# Google Business Profile profile-read implementation.
adapter_path = ROOT / 'backend/src/modules/integrations/providers/google/google-business-profile.adapter.ts'
adapter = adapter_path.read_text(encoding='utf-8')
if 'ProviderLocationProfileRecord' not in adapter:
    adapter = adapter.replace(
        '  ProviderConnectionContext,\n',
        '  ProviderConnectionContext,\n  ProviderLocationProfileRecord,\n',
        1,
    )
    helper_anchor = 'function publicAccount(account: GoogleBusinessAccount) {'
    helper_pos = adapter.find(helper_anchor)
    if helper_pos < 0: raise SystemExit('Google publicAccount anchor missing')
    helpers = r'''function googlePrimaryPhone(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const primary = (value as Record<string, unknown>).primaryPhone;
  if (typeof primary === 'string' && primary.trim()) return primary.trim();
  const additional = (value as Record<string, unknown>).additionalPhones;
  return Array.isArray(additional) ? additional.find((item): item is string => typeof item === 'string' && Boolean(item.trim()))?.trim() : undefined;
}

function googleCategoryNames(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const object = value as Record<string, unknown>;
  const all = [object.primaryCategory, ...(Array.isArray(object.additionalCategories) ? object.additionalCategories : [])];
  return [...new Set(all.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const category = entry as Record<string, unknown>;
    const label = typeof category.displayName === 'string' ? category.displayName : typeof category.name === 'string' ? category.name : '';
    return label.trim() ? [label.trim()] : [];
  }))];
}

function googleAddress(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const address = value as Record<string, unknown>;
  const lines = Array.isArray(address.addressLines) ? address.addressLines.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : [];
  const parts = [address.regionCode, address.administrativeArea, address.locality, ...lines, address.postalCode]
    .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    .map((item) => item.trim());
  return parts.length ? parts.join(', ') : undefined;
}

function googleLocationProfile(location: GoogleBusinessLocation): ProviderLocationProfileRecord | null {
  if (!location.name || !/^locations\/[A-Za-z0-9_-]+$/.test(location.name)) return null;
  const categories = googleCategoryNames(location.categories);
  return {
    externalId: location.name,
    title: location.title,
    address: googleAddress(location.storefrontAddress),
    phone: googlePrimaryPhone(location.phoneNumbers),
    website: location.websiteUri,
    regularHours: location.regularHours,
    categories: categories.length ? categories : undefined,
    coveredFields: ['name', 'address', 'phone', 'website', 'regularHours', 'categories'],
    observedAt: new Date(),
    raw: {
      name: location.name,
      title: location.title ?? null,
      storeCode: location.storeCode ?? null,
      phoneNumbers: location.phoneNumbers ?? null,
      categories: location.categories ?? null,
      storefrontAddress: location.storefrontAddress ?? null,
      websiteUri: location.websiteUri ?? null,
      regularHours: location.regularHours ?? null,
      openInfo: location.openInfo ?? null,
      metadata: location.metadata ?? null,
    },
  };
}

'''
    adapter = adapter[:helper_pos] + helpers + adapter[helper_pos:]

    method_anchor = '  async syncReviews(context: ProviderConnectionContext, cursor?: string): Promise<ProviderReviewSyncResult> {'
    method_pos = adapter.find(method_anchor)
    if method_pos < 0: raise SystemExit('Google syncReviews anchor missing')
    method = r'''  async syncLocationProfiles(context: ProviderConnectionContext): Promise<ProviderLocationProfileRecord[]> {
    const accountName = selectedAccountName(context);
    if (!accountName) {
      throw new ProviderAdapterError({
        code: 'GOOGLE_LISTING_ACCOUNT_SELECTION_REQUIRED',
        message: 'Перед синхронизацией listing profile выберите Google Business Profile account.',
        statusCode: 409,
        retryable: false,
      });
    }
    const locations = await googleBusinessProfileClient().listLocations(await accessToken(context), accountName);
    const selected = new Set(selectedLocationNames(context));
    return locations
      .filter((location) => selected.size === 0 || selected.has(location.name))
      .map(googleLocationProfile)
      .filter((profile): profile is ProviderLocationProfileRecord => Boolean(profile));
  }

'''
    adapter = adapter[:method_pos] + method + adapter[method_pos:]
    adapter_path.write_text(adapter, encoding='utf-8')
    print('Google Business Profile listing profile capability integrated')
else:
    print('Google listing profile capability already integrated')

import crypto from 'node:crypto';
import fp from 'fastify-plugin';
import type { FastifyRequest } from 'fastify';
import { operationsConfig } from '../../config/operations.config.js';
import { env } from '../../config/env.js';
import { aiProviderRegistry } from '../../modules/ai/ai-provider.registry.js';

type HttpMetric = {
  method: string;
  route: string;
  requests: number;
  errors: number;
  durationMs: number;
};

const startedAt = new WeakMap<FastifyRequest, bigint>();
const httpMetrics = new Map<string, HttpMetric>();

function sameSecret(candidate: string, expected: string): boolean {
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}


function authorizedOperationsRequest(request: FastifyRequest): boolean {
  const token = request.headers['x-operations-token'];
  const candidate = Array.isArray(token) ? token[0] : token;
  return typeof candidate === 'string' && sameSecret(candidate, operationsConfig.OPERATIONS_METRICS_TOKEN);
}

function operationsUnauthorized(request: FastifyRequest) {
  return {
    error: {
      code: 'OPERATIONS_METRICS_UNAUTHORIZED',
      message: 'Operations metrics token is required',
      requestId: request.id,
    },
  };
}

function routeLabel(request: FastifyRequest): string {
  return request.routeOptions?.url || String(request.raw.url || '/').split('?')[0] || '/';
}

function metricKey(method: string, route: string): string {
  return `${method}\u0000${route}`;
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function bigintValue(value: bigint | number | null | undefined): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  return 0n;
}

export const operationalMetricsPlugin = fp(async (app) => {
  app.addHook('onRequest', async (request) => {
    startedAt.set(request, process.hrtime.bigint());
  });

  app.addHook('onResponse', async (request, reply) => {
    const started = startedAt.get(request);
    const durationMs = started === undefined
      ? 0
      : Number(process.hrtime.bigint() - started) / 1_000_000;
    const method = request.method.toUpperCase();
    const route = routeLabel(request);
    const key = metricKey(method, route);
    const current = httpMetrics.get(key) ?? { method, route, requests: 0, errors: 0, durationMs: 0 };
    current.requests += 1;
    current.durationMs += durationMs;
    if (reply.statusCode >= 400) current.errors += 1;
    httpMetrics.set(key, current);
  });


  app.get('/internal/ai/health', async (request, reply) => {
    if (!authorizedOperationsRequest(request)) {
      return reply.code(401).send(operationsUnauthorized(request));
    }

    const provider = aiProviderRegistry.active();
    const availability = provider?.availability() ?? {
      configured: false,
      available: false,
      reasonCode: 'AI_PROVIDER_NOT_REGISTERED',
      reasonMessage: 'AI provider is not registered.',
    };

    reply.header('cache-control', 'no-store');
    return {
      enabled: env.AI_REVIEW_INTELLIGENCE_ENABLED,
      provider: provider?.id ?? null,
      model: provider?.model || null,
      configured: availability.configured,
      available: availability.available,
      reasonCode: availability.reasonCode ?? null,
      reasonMessage: availability.reasonMessage ?? null,
      domains: {
        reviewIntelligence: true,
        replyCopilot: true,
        askShield: true,
        aiVisibility: true,
      },
    };
  });

  app.get('/internal/metrics', async (request, reply) => {
    if (!authorizedOperationsRequest(request)) {
      return reply.code(401).send(operationsUnauthorized(request));
    }

    const [aiOperations, visibilityRuns, askShield, bucketCount] = await Promise.all([
      app.prisma.aiOperation.aggregate({
        _sum: { inputTokens: true, outputTokens: true, estimatedCostMicros: true },
      }),
      app.prisma.aiVisibilityRun.aggregate({
        _sum: { inputTokens: true, outputTokens: true, estimatedCostMicros: true },
      }),
      app.prisma.askShieldQuery.aggregate({
        _sum: { inputTokens: true, outputTokens: true, estimatedCostMicros: true },
      }),
      app.prisma.operationalRateLimitBucket.count(),
    ]);

    const inputTokens = bigintValue(aiOperations._sum.inputTokens)
      + bigintValue(visibilityRuns._sum.inputTokens)
      + bigintValue(askShield._sum.inputTokens);
    const outputTokens = bigintValue(aiOperations._sum.outputTokens)
      + bigintValue(visibilityRuns._sum.outputTokens)
      + bigintValue(askShield._sum.outputTokens);
    const estimatedCostMicros = bigintValue(aiOperations._sum.estimatedCostMicros)
      + bigintValue(visibilityRuns._sum.estimatedCostMicros)
      + bigintValue(askShield._sum.estimatedCostMicros);

    const aiProvider = aiProviderRegistry.active();
    const aiAvailability = aiProvider?.availability() ?? {
      configured: false,
      available: false,
      reasonCode: 'AI_PROVIDER_NOT_REGISTERED',
      reasonMessage: 'AI provider is not registered.',
    };

    const lines = [
      '# HELP business_shield_ai_provider_enabled Whether AI is enabled in server configuration.',
      '# TYPE business_shield_ai_provider_enabled gauge',
      `business_shield_ai_provider_enabled ${env.AI_REVIEW_INTELLIGENCE_ENABLED ? 1 : 0}`,
      '# HELP business_shield_ai_provider_configured Whether the active AI provider is configured.',
      '# TYPE business_shield_ai_provider_configured gauge',
      `business_shield_ai_provider_configured ${aiAvailability.configured ? 1 : 0}`,
      '# HELP business_shield_ai_provider_available Whether the active AI provider reports itself available.',
      '# TYPE business_shield_ai_provider_available gauge',
      `business_shield_ai_provider_available ${aiAvailability.available ? 1 : 0}`,
      '# HELP business_shield_process_uptime_seconds API process uptime in seconds.',
      '# TYPE business_shield_process_uptime_seconds gauge',
      `business_shield_process_uptime_seconds ${process.uptime().toFixed(3)}`,
      '# HELP business_shield_process_rss_bytes Resident memory used by the API process.',
      '# TYPE business_shield_process_rss_bytes gauge',
      `business_shield_process_rss_bytes ${process.memoryUsage().rss}`,
      '# HELP business_shield_ai_input_tokens_total Persisted AI provider input tokens across supported AI domains.',
      '# TYPE business_shield_ai_input_tokens_total counter',
      `business_shield_ai_input_tokens_total ${inputTokens}`,
      '# HELP business_shield_ai_output_tokens_total Persisted AI provider output tokens across supported AI domains.',
      '# TYPE business_shield_ai_output_tokens_total counter',
      `business_shield_ai_output_tokens_total ${outputTokens}`,
      '# HELP business_shield_ai_estimated_cost_micros_total Persisted estimated AI provider cost in currency micros.',
      '# TYPE business_shield_ai_estimated_cost_micros_total counter',
      `business_shield_ai_estimated_cost_micros_total ${estimatedCostMicros}`,
      '# HELP business_shield_operational_rate_limit_buckets Current shared rate-limit bucket rows.',
      '# TYPE business_shield_operational_rate_limit_buckets gauge',
      `business_shield_operational_rate_limit_buckets ${bucketCount}`,
      '# HELP business_shield_http_requests_total Completed HTTP requests by normalized route.',
      '# TYPE business_shield_http_requests_total counter',
    ];

    for (const metric of [...httpMetrics.values()].sort((a, b) => `${a.method}:${a.route}`.localeCompare(`${b.method}:${b.route}`))) {
      const labels = `method="${escapeLabel(metric.method)}",route="${escapeLabel(metric.route)}"`;
      lines.push(`business_shield_http_requests_total{${labels}} ${metric.requests}`);
    }

    lines.push(
      '# HELP business_shield_http_errors_total Completed HTTP responses with status >= 400 by normalized route.',
      '# TYPE business_shield_http_errors_total counter',
    );
    for (const metric of [...httpMetrics.values()].sort((a, b) => `${a.method}:${a.route}`.localeCompare(`${b.method}:${b.route}`))) {
      const labels = `method="${escapeLabel(metric.method)}",route="${escapeLabel(metric.route)}"`;
      lines.push(`business_shield_http_errors_total{${labels}} ${metric.errors}`);
    }

    lines.push(
      '# HELP business_shield_http_request_duration_ms_sum Sum of completed request durations in milliseconds.',
      '# TYPE business_shield_http_request_duration_ms_sum counter',
    );
    for (const metric of [...httpMetrics.values()].sort((a, b) => `${a.method}:${a.route}`.localeCompare(`${b.method}:${b.route}`))) {
      const labels = `method="${escapeLabel(metric.method)}",route="${escapeLabel(metric.route)}"`;
      lines.push(`business_shield_http_request_duration_ms_sum{${labels}} ${metric.durationMs.toFixed(3)}`);
    }

    reply.header('cache-control', 'no-store');
    return reply.type('text/plain; version=0.0.4; charset=utf-8').send(`${lines.join('\n')}\n`);
  });
});

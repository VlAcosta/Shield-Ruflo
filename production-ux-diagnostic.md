# Temporary recovery QA diagnostics

```text

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/home/runner/work/Shield-Ruflo/Shield-Ruflo/backend[39m

 [32m✓[39m test/production-ux-company-registry.test.ts[2m > [22mproduction company registry providers[2m > [22mmaps an exact legal-party result from the ЕГРЮЛ/ЕГРИП provider[32m 4[2mms[22m[39m
 [32m✓[39m test/production-ux-company-registry.test.ts[2m > [22mproduction company registry providers[2m > [22mdoes not accept a registry suggestion with another INN[32m 1[2mms[22m[39m
 [32m✓[39m test/production-ux-company-registry.test.ts[2m > [22mproduction company registry providers[2m > [22mdoes not mix legal and individual registry records[32m 0[2mms[22m[39m
 [32m✓[39m test/production-ux-company-registry.test.ts[2m > [22mproduction company registry providers[2m > [22mverifies НПД through FNS without inventing a person name or legal identifiers[32m 8[2mms[22m[39m
 [32m✓[39m test/production-ux-company-registry.test.ts[2m > [22mproduction company registry providers[2m > [22mrejects an unconfirmed НПД status instead of falling back to a fake success[32m 2[2mms[22m[39m
{"level":30,"time":1786480683143,"pid":2930,"hostname":"runnervmvrwv9","reqId":"002f3c9f-94e4-4840-aa27-e3fa9b3e4d27","req":{"method":"GET","url":"/api/v1/billing","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1786480683148,"pid":2930,"hostname":"runnervmvrwv9","reqId":"002f3c9f-94e4-4840-aa27-e3fa9b3e4d27","res":{"statusCode":404},"responseTime":4.567526999999927,"msg":"request completed"}
{"level":30,"time":1786480683155,"pid":2930,"hostname":"runnervmvrwv9","reqId":"ec38e277-a462-4342-8bd2-8ab9753f1b11","req":{"method":"POST","url":"/api/v1/billing/subscription/trial","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1786480683231,"pid":2930,"hostname":"runnervmvrwv9","reqId":"ec38e277-a462-4342-8bd2-8ab9753f1b11","res":{"statusCode":200},"responseTime":76.64658199999985,"msg":"request completed"}
{"level":30,"time":1786480683236,"pid":2930,"hostname":"runnervmvrwv9","reqId":"8b2cc88e-775e-4ac9-9247-30aea2803ef0","req":{"method":"POST","url":"/api/v1/billing/subscription/trial","host":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":40,"time":1786480683246,"pid":2930,"hostname":"runnervmvrwv9","reqId":"8b2cc88e-775e-4ac9-9247-30aea2803ef0","err":{"type":"AppError","message":"Пробный период PRO для этой организации уже использован","stack":"AppError: Пробный период PRO для этой организации уже использован\n    at /home/runner/work/Shield-Ruflo/Shield-Ruflo/backend/src/modules/billing/billing.service.ts:91:21\n    at processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at Proxy._transactionWithCallback (/home/runner/work/Shield-Ruflo/Shield-Ruflo/backend/node_modules/@prisma/client/src/runtime/getPrismaClient.ts:861:18)\n    at startProTrial (/home/runner/work/Shield-Ruflo/Shield-Ruflo/backend/src/modules/billing/billing.service.ts:86:3)","code":"[REDACTED]","statusCode":409,"name":"AppError"},"code":"PRO_TRIAL_ALREADY_USED","msg":"Application error"}
{"level":30,"time":1786480683267,"pid":2930,"hostname":"runnervmvrwv9","reqId":"8b2cc88e-775e-4ac9-9247-30aea2803ef0","res":{"statusCode":409},"responseTime":30.61060099999986,"msg":"request completed"}
 [31m×[39m test/production-ux-billing.integration.test.ts[2m > [22mProduction UX billing recovery[2m > [22mcreates a truthful FREE baseline and exposes the one-time PRO trial without fake checkout[32m 39[2mms[22m[39m
[31m   → expected 404 to be 200 // Object.is equality[39m
 [32m✓[39m test/production-ux-billing.integration.test.ts[2m > [22mProduction UX billing recovery[2m > [22mactivates PRO for fourteen days only once and never enables auto-renew[32m 125[2mms[22m[39m

[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 1 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m test/production-ux-billing.integration.test.ts[2m > [22mProduction UX billing recovery[2m > [22mcreates a truthful FREE baseline and exposes the one-time PRO trial without fake checkout
[31m[1mAssertionError[22m: expected 404 to be 200 // Object.is equality[39m

[32m- Expected[39m
[31m+ Received[39m

[32m- 200[39m
[31m+ 404[39m

[36m [2m❯[22m test/production-ux-billing.integration.test.ts:[2m61:33[22m[39m
    [90m 59| [39m  it('creates a truthful FREE baseline and exposes the one-time PRO tr…
    [90m 60| [39m    const response = await app.inject({ method: 'GET', url: '/api/v1/b…
    [90m 61| [39m    [34mexpect[39m(response[33m.[39mstatusCode)[33m.[39m[34mtoBe[39m([34m200[39m)[33m;[39m
    [90m   | [39m                                [31m^[39m
    [90m 62| [39m    [34mexpect[39m(response[33m.[39m[34mjson[39m())[33m.[39m[34mtoMatchObject[39m({
    [90m 63| [39m      plan[33m:[39m { code[33m:[39m [32m'FREE'[39m }[33m,[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m


[2m Test Files [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m1 passed[39m[22m[90m (2)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m6 passed[39m[22m[90m (7)[39m
[2m   Start at [22m 20:38:01
[2m   Duration [22m 2.28s[2m (transform 870ms, setup 0ms, collect 1.67s, tests 564ms, environment 1ms, prepare 200ms)[22m

```

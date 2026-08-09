
## Production Backend Requirement

Business Shield must operate as a real full-stack SaaS product.

Product capabilities that require persistence, authorization, external operations, analytics, automation, billing, integrations, notifications, background processing or business logic must be backed by real server-side functionality.

A visible frontend implementation does not mean that the product capability is complete.

Production functionality must progressively replace:
- frontend-only mocks;
- static fixture data;
- localStorage-based production state;
- simulated integrations;
- fake synchronization;
- fake publishing;
- fake billing;
- fake authentication/authorization.

The target system must include real backend APIs, persistence, tenant isolation, server-side RBAC, validation and automated testing.

The team is authorized to design and implement the backend required to achieve this.

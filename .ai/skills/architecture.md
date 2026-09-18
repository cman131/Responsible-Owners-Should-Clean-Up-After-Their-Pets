# Architecture

Blackbaud's high-level architecture patterns, conventions, and standards.

## Architecture principles

These are the governing principles for all architecture decisions at Blackbaud:

1. **Cloud-first.** New workloads deploy to Azure unless a documented ARB exception is granted. On-premises deployment requires Tier 1 review.
2. **API-first.** Systems expose capabilities through documented, versioned APIs -- not direct database access or proprietary connectors. Direct DB access across a domain boundary always escalates to the ARB.
3. **Buy before build.** Commodity capabilities use approved SaaS solutions. Custom development is reserved for differentiated capability.
4. **Data stays in its domain.** Systems own their data. Cross-domain data access goes through published APIs or approved event contracts -- never direct queries.
5. **Security is not optional.** All new systems meet baseline security requirements before production deployment. No exceptions without documented ARB dispensation.
6. **Reuse before build.** Before building a shared capability (file handling, document storage, notifications, and the like), check whether an existing internal service already provides it and reuse it through its published API rather than rebuilding. Discover existing services in the developer portal / service catalogue (Backstage); AI coding agents should also consult the AI Registry where available. Standing up a parallel capability that an existing service already covers is an architecture principle deviation and escalates to Tier 1 ARB review.

## Approved platform stack

Blackbaud runs on **Azure**. All infrastructure decisions should assume Azure as the target platform.

| Category | Standard | Notes |
|----------|----------|-------|
| **Compute** | Azure Kubernetes Service (AKS) | Containerised services |
| **Async messaging** | Azure Service Bus | Default for inter-service communication |
| **Event streaming** | Azure Event Hub | High-throughput event ingestion |
| **NoSQL data** | Azure Cosmos DB (SQL API) | Default data store for microservices |
| **Table data** | Azure Table Storage | Simple key-value storage |
| **Relational data** | Azure SQL | When strong consistency and complex queries are required |
| **Blob storage** | Azure Blob Storage | Files, images, documents |
| **Cache** | Azure Cache for Redis | In-memory caching |
| **Search** | Elasticsearch | Full-text search |
| **Data analytics** | Azure Databricks | Analytics and data engineering |
| **CDN/WAF** | Fastly | Image/asset delivery |
| **Secrets** | Azure Key Vault | SAS tokens, key rotation, certificates |
| **Alerting** | Opsgenie | On-call and incident alerting |
| **Security scanning** | Checkmarx (SAST), WhiteSource (SCA) | Mandatory for all services |
| **Endpoint security** | CrowdStrike | Mandatory on all servers/endpoints |
| **Developer portal** | Backstage | Service catalogue and documentation |

When choosing a technology, check this list first. Using an approved platform component requires no architecture review. Introducing a new technology category always requires Tier 1 ARB review.

## Service design

### Microservices

Blackbaud uses a microservice architecture. Each service owns its own data and exposes a well-defined API.

**Principles:**
- One service per bounded context. Keep responsibilities narrow.
- Services communicate via Azure Service Bus (async, preferred) or REST APIs (sync, when necessary).
- Each service manages its own data store -- no shared databases between services.
- Services are deployed independently via their own CI/CD pipelines.
- Always use the latest stable releases of languages, runtimes, and libraries. The vulnerability management programme requires staying on supported versions.

**When to use Service Bus vs REST:**
- **Service Bus:** Event-driven workflows, eventual consistency is acceptable, fire-and-forget notifications, cross-service data propagation. This is the default.
- **REST:** Synchronous request/response is required, the caller needs an immediate answer, or the downstream system only supports HTTP (e.g., third-party webhooks).

### Multi-tenancy

Blackbaud services are multi-tenant. Every service must isolate tenant data. Tenant context comes from authenticated claims (BBID token) -- never accept tenant ID from the client as a raw parameter without validation. See the `auth.md` skill for BBID integration details and the stack-specific skills (`dotnet.md`, `java.md`) for data isolation implementation patterns.

### Error handling

Use **RFC 7807** (`application/problem+json`) for all error responses. Do not invent custom error formats. See the stack-specific skills for framework-provided exception types that conform to this standard.

## Naming conventions

### Repositories

| Type | Pattern | Example |
|------|---------|---------|
| Backend service | `{product-code}-{microservice-code}-svc` | `mir-miras-svc`, `bcp-cnsnt-svc` |
| Frontend SPA | `skyux-spa-{product-name}` | `skyux-spa-mira`, `skyux-spa-donor-form` |
| Shared library | `@blackbaud-internal/skyux-lib-{domain}` | `skyux-lib-email-builder` |

### Product and microservice codes

- **Product code:** 3-letter abbreviation. Use a B prefix for Blackbaud-wide services (e.g., BCP for Blackbaud Consent Platform). Product-specific codes are shorter (e.g., MIR, FIL).
- **Microservice code:** 5-letter abbreviation, typically vowels removed (e.g., CNSNT for Consent, MIRAS for Mira Service). Should be recognisable from the full name.
- **.NET namespace:** `Blackbaud.{Domain}.Service` (e.g., `Blackbaud.Consent.Service`)

### Services and APIs

- Use lowercase, hyphenated names for service identifiers.
- REST endpoints follow SKY API conventions where the service is SKY API-surfaced.
- Internal service endpoints should still follow RESTful resource naming.

### Branches

- Feature branches: `feature/{ticket-or-description}`
- Documentation: `docs/{topic}`
- Fix: `fix/{description}`

## Data storage

### Cosmos DB (default)

- **API:** SQL API (not MongoDB, Table, or Gremlin).
- **Partition key strategy:** Choose based on query patterns. Common choices: `/id` (simple), `/environmentId` (multi-tenant), `/campaignId` (domain-specific). The partition key determines data co-location and query performance.
- **Throughput:** Plan throughput management before Go Live. Autoscale where appropriate, but understand cost implications.

See the stack-specific skills (`dotnet.md`, `java.md`) for data access implementation patterns (EF Core, Flyway, etc.).

### Azure SQL

- Use for relational data where strong consistency and complex queries are required.
- **Schema changes:** Must have a schema change management plan documented before Go Live.

## Authentication and authorisation

All user-facing services must authenticate via **BBID** (Blackbaud Identity). Service-to-service calls use **SAS** (synchronous) or **Service Bus** (async). See the `auth.md` skill for integration details, entitlement scopes, and implementation patterns.

## Architecture decision records (ADRs)

Significant architecture decisions must be documented. An ADR should capture:

1. **Context** -- what prompted the decision
2. **Options considered** -- at least two alternatives
3. **Decision** -- what was chosen and why
4. **Consequences** -- what trade-offs were accepted

**Format:** `adr-NNNN-short-title.md` with status (Proposed / Accepted / Deprecated / Superseded).

ADRs live in the repo they affect (e.g., `docs/adrs/` or `docs/architecture/`). For cross-cutting decisions, present at the Architecture Review Board (ARB).

### Tiered governance

Not every decision needs the full ARB. Blackbaud uses a three-tier governance model:

| Tier | Who decides | When |
|------|-------------|------|
| **Tier 1 -- Enterprise ARB** | Enterprise Architects | New technology category, cross-domain integration, PII/PHI in new context, AI/ML in production, architecture principle deviation, multi-year vendor contracts |
| **Tier 2 -- Domain review** | Designated Solution Architects | New solution within existing patterns, vendor selection (low lock-in), internal API within one domain, bounded migration |
| **Tier 3 -- Team ADR** | Engineering team | Implementation pattern choice, version upgrade, config change, anything within approved standards |

**Mandatory escalation to Tier 1:** New technology category, customer-facing API/data contract changes, PII/PHI/PCI in new context, first production AI/ML use, architecture principle deviation. When in doubt, escalate.

A decision that stays fully within approved standards needs no tier review -- it is already decided. Document it in a Tier 3 ADR citing the standard.

## Service Go Live

Before a service accepts client traffic, it must complete the Go Live process. This is a business process on top of CI/CD -- having a production deployment does not mean the service is "live".

**Key requirements:**
- Contact list on SCS up to date
- CI/CD passing, integration tests defined
- All needed alerts enabled (Opsgenie)
- WAF enabled in Block mode
- Security assessment completed (App Security team)
- Compliance sign-off (PCI scope, PHI, cardholder data)
- Incident Management onboarded (Opsgenie team, alert schedule)
- Change Management approved (Standard Change Template via CRC/CAB)

Go Live is completed per zone (e.g., `p-usa01`, `p-eur01` separately). Start the process 2-3 weeks before accepting traffic.

**Reference:** https://docs.blackbaud.com/engineering-system-docs/learn/microservices/service-go-live

## Anti-patterns

Do not:
- Share databases between services. Each service owns its data.
- Rebuild a capability that an existing shared service already provides. Reuse it through its published API.
- Accept tenant context from client input without BBID token validation.
- Use synchronous REST calls when Service Bus would work. Default to async.
- Create custom error response formats. Use RFC 7807.
- Skip the Go Live process. A deployed service is not a live service.
- Store secrets in code, config files, or environment variables. Use Azure Key Vault.
- Scaffold configuration folders for AI tools you do not use.

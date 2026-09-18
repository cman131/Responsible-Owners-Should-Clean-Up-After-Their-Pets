# Pipelines

Blackbaud CI/CD, deployment, and infrastructure patterns.

> **Status:** This skill covers the fundamentals but is not yet comprehensive. The Engineering System platform team owns the pipeline infrastructure -- if you encounter gaps here, search the ES Platform Docs wiki in ADO or consult the `#dev-dotnet` Slack channel. Contributions welcome via PR.

## How pipelines work at Blackbaud

Blackbaud uses a **platform-managed CI/CD model**. Teams do not write their own build/release pipelines from scratch. The Engineering System (ES) provides the pipeline infrastructure, and services configure their behaviour through `skyconfig.json`.

### The typical flow

1. **`sky new`** scaffolds the repo with a pipeline definition
2. **ES Hub** composes the AKS release pipeline for your service (ES Hub > SCS page > Service page > Compose AKS release definition)
3. **On push to master**, the build pipeline runs: compile, test, code coverage check, security scanning, Docker image build
4. **Release** deploys to a validation slot first, then gradually shifts traffic (percentage-based) until 100% is on the new deployment
5. **If validation fails**, the release rolls back automatically

Do not create custom ADO build/release pipelines for standard microservices. Use the ES-provided pipeline and configure behaviour via `skyconfig.json`.

## Zone model

Blackbaud deploys to isolated zones. Each zone is a separate AKS cluster with its own data stores and configuration.

| Zone prefix | Environment | Purpose |
|-------------|-------------|---------|
| `t-` | Test | Development and testing (e.g., `t-usa01`) |
| `p-` | Production | Customer-facing traffic (e.g., `p-usa01`, `p-eur01`) |

Services are deployed zone-by-zone. Go Live is completed per zone -- a service can be live in `p-usa01` but not yet in `p-eur01`.

## What skyconfig.json controls in the pipeline

`skyconfig.json` is the primary way to configure pipeline behaviour. The build and release pipelines read it directly. Key pipeline-relevant settings:

- `codeCoverageThreshold` -- build fails if coverage drops below this percentage
- `serviceClients` -- triggers NSwag client code generation during build
- `asyncTopics` -- triggers Service Bus contract generation during build
- `permissionsResolver.filePath` -- triggers permissions composition into BBID during release
- `SKYAPI` -- configures SKY API OpenAPI doc generation and developer portal metadata

## Security scanning

Two mandatory security scans run as part of every build pipeline:

| Tool | Type | What it checks |
|------|------|----------------|
| **Checkmarx** | SAST (Static Application Security Testing) | Source code vulnerabilities |
| **WhiteSource** | SCA (Software Composition Analysis) | Vulnerable dependencies |

Do not disable or skip these scans. If a scan fails, fix the vulnerability -- do not suppress the finding without approval from the App Security team.

## Monitoring and health

When the AKS release pipeline is composed, the Engineering System automatically:

- Creates an **Application Insights** instance per zone for the service
- Configures **availability alerts** and **monitor test alerts**
- Wires up **Opsgenie** alerting for the SCS contact list

Health probe endpoints (`/version`, `/ready`, `/monitor`) are provided by `Blackbaud.Core.Health` and are used by the release pipeline to validate deployments. Register monitor tests in `Startup.ConfigureServices` via `services.AddMonitorTest<T>()`.

## SPA pipelines

SPA pipelines are separate from microservice pipelines and follow a different model. The ES Platform on-call runbook explicitly notes that SKY UX SPA pipelines are out of scope for the platform team's standard support.

SPA builds use `@blackbaud-internal/skyux-angular-builders` and are typically configured through `angular.json` and `skyuxconfig.json`. See the `spa.md` skill for frontend-specific configuration.

## What to do when the pipeline fails

1. Check the **build log** in ADO for the specific failure (test failure, coverage drop, security scan finding, compilation error)
2. For security scan findings, check the **Checkmarx** or **WhiteSource** portal for details
3. For release failures, check the **validation slot** health probes and Application Insights
4. For infrastructure issues (pipeline composition, AKS, zone problems), contact the ES Platform team via `#es-platform-support` in Slack

## Reference

- ES Hub: `https://host.nxt.blackbaud.com/engsys-hub`
- ES Pipelines: `https://host.nxt.blackbaud.com/engsys/pipelines`
- Engineering System docs: `https://docs.blackbaud.com/engineering-system-docs`
- Incident handling: `https://docs.blackbaud.com/engineering-system-docs/learn/incidents`

# Playbook: Create a new .NET microservice

Step-by-step guide for creating a new Blackbaud .NET microservice from scratch, through to production-ready. Load the `architecture.md`, `dotnet.md`, and `auth.md` skills alongside this playbook.

## Prerequisites

- .NET SDK installed (version pinned in `global.json` after scaffolding)
- npm installed (for Sky CLI and private registry auth)
- Azure DevOps access to the Products project
- Private npm registry configured in `~/.npmrc` (`npx vsts-npm-auth -config ~/.npmrc`)

## Step 1: Create the service in Engineering System Hub

1. Open ES Hub: `https://host.nxt.blackbaud.com/engsys-hub/scs/details/{your-scs}`
2. Click **Add new resource** > **New Microservice**
3. Enter the microservice name (5-letter code, e.g., `MIRAS`)
4. This creates the ADO repo and provisions the service identity

## Step 2: Scaffold the project

Do **not** clone the repo first -- `sky new` clones it for you.

```shell
npm install -g @blackbaud-internal/sky-cli
sky ext update
sky new
```

Follow the prompts:
- Choose `net-core`
- Enter the namespace: `Blackbaud.{Domain}.{ServiceName}` (e.g., `Blackbaud.MirMiras.Service`)

This generates a working skeleton with:
- `Program.cs` and `Startup.cs` wired to `Blackbaud.Core.App`
- `skyconfig.json` with sensible defaults
- `nuget.config` with `packageSourceMapping` for supply-chain security
- CI/CD pipeline definition
- Test projects

## Step 3: Configure skyconfig.json

Update the generated `skyconfig.json`:

- `name` -- service name (format: `blackbaud-{service-name}`)
- `namespace` -- .NET namespace
- `codeCoverageThreshold` -- set to 80 (or your team's agreed threshold)
- `devPorts` -- local dev port (the framework reads this; `launchSettings.json` is ignored)
- `permissionsResolver.filePath` -- point to `Permissions/Permissions.cs`

## Step 4: Set up the project structure

Ensure two projects exist:

```text
src/
  Blackbaud.{Domain}.Domain/         -- entities, repositories, domain logic
  Blackbaud.{Domain}.Service/        -- controllers, Startup, Program, permissions
test/
  Blackbaud.{Domain}.Service.UnitTests/
  Blackbaud.{Domain}.Domain.UnitTests/
```

Register domain services via extension methods in the Domain project:
- `AddRepositories()` -- DI registration for all repositories
- `AddHostedServices()` -- background services
- `AddDataStore(env)` -- EF Core / Cosmos DB context

Call these from `Startup.ConfigureServices`.

## Step 5: Set up data access

If using Cosmos DB (the default):

1. Create a `DataContext` class inheriting `DbContext` in the Domain project
2. Create entity classes deriving from `CosmosEntity`
3. Configure container/partition mapping in `OnModelCreating`
4. Create repositories deriving from `PurgeableCosmosRepository<T>`
5. Add a `CosmosHostedService` that calls `context.Database.EnsureCreatedAsync()` on startup
6. In `AddDataStore`, configure `UseCosmos(...)` for production and `UseInMemoryDatabase(...)` for unit tests

For local Cosmos credentials, use .NET user secrets:
```shell
cd src/Blackbaud.{Domain}.Service
dotnet user-secrets set "Cosmos:{db}:AccountName" "{value}"
dotnet user-secrets set "Cosmos:{db}:AccountKey" "{value}"
```

Get values from ES Compose for your Cosmos database.

## Step 6: Write your first controller

1. Create a controller in the Service project
2. Use `IRequestContext.EnvironmentId` for tenant context
3. Add `[SupportalEndpoint(null)]` for initial employee-only auth
4. Define intended scopes in `Permissions/Permissions.cs` (even if not yet registered with BBID)
5. Return `CreatedAtAction(nameof(GetById), ...)` for create/upsert operations
6. Throw V2 exceptions for errors -- see the `dotnet.md` skill for the full exception table

## Step 7: Write tests

Three layers:

1. **Controller unit tests** -- mock repositories and `IRequestContext` with Moq
2. **Auth integration tests** -- use `TestServerFixtureBase` with `client.WithBBIDAuthorization()`
3. **Domain unit tests** -- test repositories against EF Core InMemory

Use `xunit.v3` patterns: `TestContext.Current.CancellationToken`, not v2 constructor injection.

## Step 8: Configure OpenAPI

1. Enable Swagger in `appsettings.json`:
   ```json
   "Swagger": { "SaveDocuments": ["sas"] }
   ```
2. If this will be a SKY API, add:
   ```json
   "Swagger": { "EnableSKYAPIDoc": true }
   ```
   And set `SKYAPI.serviceTitle` and `SKYAPI.serviceDescription` in `skyconfig.json`.

## Step 9: Set up service-to-service auth (if needed)

If your service calls other services:
1. Configure SAS in ES Hub (see `auth.md` skill)
2. Add service clients to `skyconfig.json`
3. Set up local SAS keys in `appsettings.secrets.json`

If other services call your service:
1. Configure your service's SAS authorisation policy in ES Hub
2. Add the calling services to the policy

## Step 10: Go Live checklist

Before accepting client traffic, complete the Go Live process:

- [ ] Contact list on SCS up to date
- [ ] CI/CD pipeline passing, integration tests defined
- [ ] All needed alerts enabled (Opsgenie)
- [ ] WAF enabled in Block mode
- [ ] Security assessment completed (App Security team) -- allow 2-4 weeks
- [ ] Compliance sign-off (PCI scope, PHI, cardholder data)
- [ ] Incident Management onboarded (Opsgenie team, alert schedule)
- [ ] Change Management approved (Standard Change Template via CRC/CAB)

Go Live is completed per zone (e.g., `p-usa01`, `p-eur01` separately). Start 2-3 weeks before you need to accept traffic.

**Reference:** https://docs.blackbaud.com/engineering-system-docs/learn/microservices/service-go-live

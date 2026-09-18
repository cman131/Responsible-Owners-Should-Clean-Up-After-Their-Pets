# .NET

Blackbaud .NET / C# service conventions.

## Creating a new service

Use the **Sky CLI** to scaffold a new .NET service:

```shell
npm install -g @blackbaud-internal/sky-cli
sky ext update
sky new
```

`sky new` prompts for service details (SCS code, microservice name, etc.) and clones the `web-service-template-net-core` repo with a working skeleton including `Program.cs`, `Startup.cs`, `skyconfig.json`, CI/CD pipeline, and test projects.

Before running `sky new`, create the microservice in **Engineering System Hub** (ES Hub) under your SCS: Add new resource > New Microservice. Do not clone the repo before running `sky new` -- the command clones it for you.

**Other Sky CLI commands:**
- `sky engsys contracts generate` -- generates Service Bus async contract brokers from `skyconfig.json` `asyncTopics` configuration
- `sky axs permissions generate` -- generates permissions enum from the permissions resolver file

Ensure the Sky CLI axs extensions are installed before attempting to generate permissions.

```shell
sky ext install @blackbaud-internal/sky-cli-extensions-axs
```

## Blackbaud.Core.App framework

All Blackbaud .NET services are hosted on the `Blackbaud.Core.App` framework. Adding `Blackbaud.Core.App` as a package reference transitively includes all the framework packages:

| Package | Purpose |
|---------|---------|
| `Blackbaud.Core.Hosting` | Host bootstrap (`ConfigureBlackbaudHost`, `ConfigureBlackbaudWebHost`) |
| `Blackbaud.Core.WebService.AspNetCore` | MVC pipeline, filters, error responses, request context |
| `Blackbaud.Core.WebService.Contracts` | `IRequestContext`, `UserAccess`, V2 exception types |
| `Blackbaud.IdentityManagement.TokenAuthentication` | JWT validation for BBID, SAS, and SKY API schemes |
| `Blackbaud.Core.Health` | `/version`, `/ready`, `/monitor` probe endpoints |
| `Blackbaud.Core.Observability` | OpenTelemetry tracing (Honeycomb), billing events |
| `Blackbaud.Logging` | Structured logging to Splunk via Serilog |
| `Blackbaud.Swagger.AspNetCore` | OpenAPI generation with SKY API standards |
| `Blackbaud.NSwag.Client` | Base client for calling other services with SAS auth |
| `Blackbaud.Permissions.Resolver` | Permission flag resolution from JWT |
| `Blackbaud.Testing` | Test server fixtures, HTTP assertion helpers, auth helpers |

### Version pinning

Use a wildcard minor version to pick up bug fixes automatically:

```xml
<PackageReference Include="Blackbaud.Core.App" Version="10.*" />
```

When testing a core-app pre-release, pin the exact version temporarily. Remove the pin before merging.

### Host setup

`Program.cs` builds the host using the framework's entry points:

```csharp
ConfigureBlackbaudHost(args)
    .ConfigureBlackbaudWebHost<Startup>()
    .Build()
    .Run();
```

`Startup.Configure` should be minimal -- the framework wires the middleware pipeline through `app.ConfigureBlackbaud<Startup>()`. Do not add middleware directly; use the framework's extension hooks.

### Service registration

Register dependencies in `Startup.ConfigureServices`. Organise registrations into extension methods by concern (e.g., `AddRepositories()`, `AddHostedServices()`, `AddDataStore(env)`). Keep `Startup.cs` clean -- it should call extension methods, not contain registration logic inline.

## Project structure

Use two projects per service:

| Project | Contains | Does NOT contain |
|---------|----------|------------------|
| `Blackbaud.{Domain}.Domain` | Entities, EF Core `DataContext`, repositories, domain logic, hosted services | Controllers, HTTP concerns |
| `Blackbaud.{Domain}.Service` | Controllers, `Program`, `Startup`, permissions, appsettings | Business logic |

This separation ensures the domain layer is independently testable and reusable.

### Test projects

Mirror the source structure:

- `test/Blackbaud.{Domain}.Service.UnitTests` -- controller-level tests with mocked repositories
- `test/Blackbaud.{Domain}.Domain.UnitTests` -- entities, repositories (against EF Core InMemory), domain logic

Auth integration tests belong in the Service test project using `TestServerFixtureBase` (see Testing section).

## Solution file

Newer services use the `.slnx` format (XML-based, cleaner diffs). When using `.slnx`, pass it explicitly to `dotnet` commands:

```shell
dotnet build my-service.slnx
dotnet test my-service.slnx
```

Older services use `.sln` -- both formats work. Pin the .NET SDK version in `global.json`.

## Configuration

### Configuration files

| File | Purpose | Committed? |
|------|---------|------------|
| `appsettings.json` | Base configuration | Yes |
| `appsettings.Development.json` | Local dev overrides (no secrets) | Yes |
| `appsettings.secrets.template.json` | Template showing required secret keys | Yes |
| `appsettings.secrets.json` | Actual secrets (copy from template, fill in values) | No |
| `appsettings.UnitTests.json` | Overrides for test runs | Yes |

### skyconfig.json

`skyconfig.json` is the Blackbaud service manifest. Key settings:

- `name` -- service name (format: `blackbaud-{service-name}`)
- `namespace` -- .NET namespace (format: `Blackbaud.{Domain}`)
- `codeCoverageThreshold` -- minimum code coverage percentage (typically 80)
- `permissionsResolver.filePath` -- path to permissions definition file
- `devPorts` -- local dev ports (the framework reads these; `launchSettings.json` is ignored)
- `serviceClients` -- NSwag service client definitions (service name + swagger URL)
- `asyncTopics` -- Service Bus topic/contract definitions for async messaging
- `SKYAPI` -- SKY API metadata (`serviceTitle`, `serviceDescription`) for developer portal

`Blackbaud.Core.App` includes JSON schema files for `skyconfig.json` and `appsettings*.json` -- point the `$schema` property at the generated schema in `bin/` for IDE intellisense.

### Secrets management

Local secrets use either .NET user secrets or `appsettings.secrets.json` (gitignored). Get secret values (Cosmos keys, SAS keys, Service Bus connection strings) from **ES Compose** or **CyberArk**.

## Data access -- EF Core + Cosmos DB

EF Core with the Cosmos DB provider is the standard data access path for .NET services.

### DataContext

Create a single `DataContext` class (inherits `DbContext`) in the Domain project's infrastructure layer. Configure it via `UseCosmos(...)` in a `StartupExtensions.AddDataStore` method.

### Entity base class

Entities derive from a `CosmosEntity` base class:

- Abstract `PartitionKey` property -- each entity defines its own partition strategy
- `Id` with a protected setter
- `_etag` for optimistic concurrency
- Optional `ttl` for time-to-live

Container and partition mapping are configured in `OnModelCreating`.

### Repository pattern

Repositories derive from `PurgeableCosmosRepository<T>`. They translate EF errors into V2 exceptions (see Error handling below):

- `DbUpdateConcurrencyException` -- throw `ConcurrencyV2Exception`
- `DbUpdateException` with inner `CosmosException` HTTP 409 -- throw `ConcurrencyV2Exception`
- All other `DbUpdateException` -- do not wrap; let them bubble to the framework's uncaught-exception filter (which returns a 500 problem+json)
- HTTP 429 -- handled by the Cosmos SDK's built-in retry; do not catch explicitly

### Database provisioning

Use a hosted service that calls `context.Database.EnsureCreatedAsync()` on startup to provision the database and containers on first run.

### Unit testing data access

When `IHostEnvironment.EnvironmentName` is `"UnitTests"`, swap `UseCosmos(...)` for `UseInMemoryDatabase(...)` in `AddDataStore`. The test fixture sets this environment.

## Shared resource libraries

Blackbaud publishes wrapper libraries for common Azure resources:

| Library | Repository | Purpose |
|---------|------------|---------|
| `Blackbaud.Core.Cosmos` | `cosmos-dotnet` | Cosmos DB SDK wrapper with best practices |
| `Blackbaud.Core.ServiceBus` | `core-servicebus` | Service Bus integration for async messaging |
| `Blackbaud.Core.StorageQueue` | `core-storagequeue` | Storage Queue adapter with poison/dead-letter support |
| `Blackbaud.Core.AzureStorageProxy` | `core-storage-proxy` | Proxy requests to Azure Storage with YARP |
| `Blackbaud.Entitlements.CacheClient` | `entitlements-cache-client-dotnet` | Cached entitlements access via etz-relay |
| `Blackbaud.Permissions.Resolver` | `permissions-resolver` | Permission flag resolution from JWT tokens |

Use these instead of writing direct Azure SDK integrations.

## Error handling -- V2 exceptions

All controllers and repositories must throw the V2 exception types from `Blackbaud.Core.WebService.Contracts.Exceptions`. The framework's exception filters convert these into RFC 7807 `application/problem+json` responses with stable URN error types.

| Scenario | Exception | HTTP |
|----------|-----------|------|
| Optimistic concurrency | `ConcurrencyV2Exception` | 409 |
| Domain-level conflict | `ConflictV2Exception` | 409 |
| Authorisation failure | `ForbiddenV2Exception` | 403 |
| Caller-supplied bad input | `InvalidInputV2Exception<TErrorEnum>` | 400 |
| Precondition (ETag mismatch) | `PreconditionFailedV2Exception` | 412 |
| Resource missing | `RecordNotFoundV2Exception` | 404 |
| Resource permanently gone | `ResourceGoneV2Exception` | 410 |

**Key rules:**
- `InvalidInputV2Exception` is abstract -- always use the generic `<TEnum>` form so clients get a typed error code. Do not return `BadRequest("...")` for input validation.
- There is no `PersistenceV2Exception`. Generic database failures should bubble to the framework's `LogUncaughtExceptionsFilter`, which returns a 500 problem+json.
- V1 exception types (`ConcurrencyException`, `PersistenceException`, etc.) are deprecated. Do not introduce new throws; replace existing ones when you touch the file.

**Reference:** https://docs.blackbaud.com/engineering-system-docs/getting-started/handbook/microservices/tech-stacks/dotnet-core/error-responses

## Controllers

- Tenant identity comes from `IRequestContext.EnvironmentId` (BBID environment claim). Pass it to repositories as the partition key. Do not read claims directly from `HttpContext`.
- Return `CreatedAtAction(nameof(GetById), ...)` for create/upsert operations.
- Use `[SupportalEndpoint(null)]` for employee-only endpoints (BBID auth, no scope check). Transition to scope-based auth using `Permissions.cs` when entitlement scopes are registered.

### Permissions

`skyconfig.json` points `permissionsResolver.filePath` at `Permissions/Permissions.cs`. The ES build uses this to identify the meaning of the BBID JWT permissions claim. In order to update the generated `Permissions/Permissions.cs` first update the `permissionsResolver.generatedNamespaces` array within `skyconfig.json`. `generatedNamespaces` should include a list of all of the permission categories for permissions that will be used by this service. Each permission category is formatted as `Roledomain.Permissioncategory` or `Roledomain.Purpose.Permissioncategory` and will serve as the namespace used for generated permissions. Generally prefer using permissions categories from the Base role domains (which omit the `Purpose` namespace) rather than product-specific role domains (where `Purpose` would be `RENXT` or `FENXT` for example).

If you already know the permission categories, list them directly in `generatedNamespaces`. You can find Role Domains and Permission Categories in the AXS permissions supportal at `https://host.nxt.blackbaud.com/permissions-support/role-domain-list` and choose the ones relevant to this microservice. It may also be helpful to look at the permission scopes that will be used by SPAs calling this service (visible at `https://host.nxt.blackbaud.com/permissions-support/`) and including each namespace referenced by a permission included in the relevant permission scopes.

Once the `generatedNamespaces` property has been set, use `sky axs permissions generate` to generate `Permissions/Permissions.cs`.

## Service clients -- calling other services

Use `Blackbaud.NSwag.Client` for service-to-service calls with SAS auth propagation.

Configure clients in `skyconfig.json`:

```json
"serviceClients": [
  {
    "serviceName": "ExampleService",
    "swaggerUrl": "https://{scs}-{stack}.app.blackbaud.net/{service}/swagger/{auth}/swagger.json"
  }
]
```

The build generates typed client classes from the OpenAPI spec. Auth propagation (SAS tokens) is handled by the base client -- do not implement it manually.

For local development, configure SAS keys in `appsettings.secrets.json`:

```json
{
  "ServiceClients": {
    "Shared": {
      "ServiceAccessKey": "{your-local-SAS-key}"
    }
  }
}
```

## Logging and observability

- **Logging:** `Blackbaud.Logging` provides structured logging via Serilog, shipped to **Splunk**. Use `ILogger<T>` as normal -- the framework configures Serilog sinks automatically.
- **Tracing:** `Blackbaud.Core.Observability` provides OpenTelemetry tracing to **Honeycomb**. No manual setup required -- the framework instruments HTTP requests, EF Core queries, and Service Bus operations.
- **Health probes:** `Blackbaud.Core.Health` exposes `/version`, `/ready`, and `/monitor` endpoints. Register monitor tests in `Startup.ConfigureServices` via `services.AddMonitorTest<T>()`.

## NuGet -- dependency-confusion mitigation

`nuget.config` must pin `Blackbaud.*` packages to the internal Blackbaud feed via `packageSourceMapping`. This prevents an attacker from shadowing internal packages by uploading the same name to nuget.org.

```xml
<packageSourceMapping>
  <packageSource key="nuget.org">
    <package pattern="*" />
  </packageSource>
  <packageSource key="Blackbaud">
    <package pattern="Blackbaud.*" />
  </packageSource>
</packageSourceMapping>
```

Do not remove these mappings.

## Testing

### xUnit v3

Test projects use `xunit.v3`. Key differences from v2:

- Use `TestContext.Current.CancellationToken` in test bodies -- not the older v2 constructor-injected patterns
- `ITestOutputHelper` is replaced by `TestContext.Current.TestOutputHelper`

### Test layers

| Layer | What it tests | How |
|-------|---------------|-----|
| **Controller unit tests** | Request/response mapping, input validation | Mock repositories and `IRequestContext` with Moq |
| **Auth integration tests** | Middleware pipeline, auth enforcement | `TestServerFixtureBase` with real middleware; use `client.WithBBIDAuthorization()` / `client.WithBBIDBlackbaudEmployeeAuthorization(envId)` from `Blackbaud.Testing` |
| **Domain unit tests** | Entities, repositories, domain logic | EF Core InMemory provider |

Do not hand-craft JWTs for auth tests. Use the `Blackbaud.Testing` helpers -- they generate properly-formed test tokens.

### Code coverage

`skyconfig.json` sets the coverage threshold (typically 80%). Use `[ExcludeFromCodeCoverage]` only on framework wiring (`Program`, `Startup`, hosted services, trivial DI plumbing) -- never on business logic.

## OpenAPI

- Check OpenAPI spec files into the repo (typically in `openapi/`)
- Configure `Swagger.SaveDocuments` in `appsettings.json` to list which spec documents to generate
- Enable SKY API docs with `"Swagger": { "EnableSKYAPIDoc": true }` in `appsettings.json` and set `SKYAPI.serviceTitle` / `SKYAPI.serviceDescription` in `skyconfig.json`
- The ES Swagger UI URL (`app.blackbaud.com/es-swagger-ui/...`) serves HTML, not the spec. The actual OpenAPI JSON lives on the service host: `https://{scs}-{stack}.app.blackbaud.net/{service}/swagger/{auth}/swagger.json`
- **SKY API docs are public-facing -- never leak internal identifiers into them.** Anything that feeds the published spec carries no ADR numbers/names, internal ticket/story ids, or internal-only class names: `[SwaggerOperation]` / `[SwaggerResponse]` description strings, `IExamplesProvider` examples, and XML-doc `<summary>` text on `[SKYAPIEndpoint]` controllers and the request/response DTOs **and enums** they expose (enum summaries land in the schema too). Keep those references in `//` code comments or internal docs only. After changing any of these, regenerate the spec (run the service so `Swagger.SaveDocuments` writes it) and confirm it is clean, e.g. `grep -i adr openapi/skyapi.json`. Supportal/internal endpoints are excluded from the published spec, but apply the same hygiene to any customer-readable text.
- When you declare an explicit `[SwaggerResponse]` for an error (e.g. a 409), also declare the success response explicitly -- `[SwaggerResponse(200, "...", typeof(TResponse))]`. Once any response is declared explicitly, the implicit 200 is dropped and the SKY API validator fails with `response_status_with_at_least_one_success_code`.

## Reference repositories

When documentation is insufficient, browse these repos for concrete examples:

| Repo | Purpose |
|------|---------|
| `web-service-template-net-core` | Full example service with controllers, business logic, startup, and tests |
| `web-service-template-net-core-empty` | Minimal starting point for a new service |
| `core-app` | Source for all `Blackbaud.Core.*` and `Blackbaud.Testing` packages |
| `sky-cli` | Sky CLI tooling and extensions |
| `cosmos-dotnet` | Cosmos DB wrapper library |

When you need to understand how a `Blackbaud.Core.*` or `Blackbaud.Testing` API works (method signatures, overloads, constructor parameters), search the `core-app` repository source before guessing.

## Anti-patterns

Do not:
- Add middleware directly in `Startup.Configure`. Use the framework's `ConfigureBlackbaud` pipeline.
- Read tenant claims directly from `HttpContext`. Use `IRequestContext.EnvironmentId`.
- Return `BadRequest("...")` for validation errors. Throw `InvalidInputV2Exception<TEnum>`.
- Introduce V1 exception types. Use V2 exclusively.
- Remove `packageSourceMapping` entries from `nuget.config`. They prevent supply-chain attacks.
- Use `[ExcludeFromCodeCoverage]` on business logic. Only use it on wiring code.
- Catch HTTP 429 from Cosmos DB. The SDK retries automatically.
- Write direct Azure SDK integrations when a `Blackbaud.Core.*` wrapper exists (Cosmos, ServiceBus, StorageQueue).
- Hand-craft JWTs for tests. Use `Blackbaud.Testing` auth helpers.

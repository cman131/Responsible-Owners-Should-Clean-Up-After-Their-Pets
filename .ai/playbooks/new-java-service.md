# Playbook: Create a new Java microservice

Step-by-step guide for creating a new Blackbaud Java microservice from scratch, through to production-ready. Load the `architecture.md`, `java.md`, and `auth.md` skills alongside this playbook.

## Prerequisites

- Java 17 SDK installed
- Node.js / npm installed (for Sky CLI)
- Azure DevOps access to the Products project
- Private npm registry configured in `~/.npmrc` (`npx vsts-npm-auth -config ~/.npmrc`)
- Gradle wrapper (`gw`) available (scaffolded automatically by `sky new`)

## Step 1: Create the service in Engineering System Hub

1. Open ES Hub: `https://host.nxt.blackbaud.com/engsys-hub/scs/details/{your-scs}`
2. Click **Add new resource** > **New Microservice**
3. Enter the microservice name (5-letter code, e.g., `EXSVC`)
4. This creates the ADO repo and provisions the service identity

## Step 2: Scaffold the project

Do **not** clone the repo first -- `sky new` clones it for you.

```shell
npm install -g @blackbaud-internal/sky-cli
sky ext update
sky new
```

Follow the prompts and choose the Java Spring Boot template. `sky new` generates a working skeleton with:

- `build.gradle` and `settings.gradle` wired to `common-deployable`
- `gradle.properties` with `commonDeployableVersion`, `commonLoggingVersion`, etc.
- Main application class with `@SpringBootApplication` and `@Import(WebMvcRestServiceConfig.class)`
- `application.properties` and `application-local.properties`
- CI/CD pipeline definition
- Test directories (`src/test/groovy/`, `src/componentTest/groovy/`)

## Step 3: Configure application.properties

Update the generated `application.properties`:

```properties
# Service identity (required for SAS auth)
service.name=my-service-name
server.servlet.context-path=/my-service

# OpenAPI metadata
api.title=My Service
api.description=Brief description of my service
api.version=1.0

# SKY API exposure (if applicable)
skyapi.service-title=My Service
skyapi.service-description=Brief description
```

For local secrets (SAS keys, Cosmos credentials), use environment variables or a gitignored local properties file. Do not commit secrets.

## Step 4: Set up the project structure

```
src/main/java/com/blackbaud/{domain}/
├── {ServiceName}Application.java        # Main class
├── config/                              # @Configuration classes
├── controller/                          # @RestController classes
├── service/                             # Business logic
├── repository/                          # Spring Data repositories
├── model/                               # Domain entities and DTOs
│   └── entity/                          # JPA or Cosmos entities
└── client/                              # Feign client interfaces
```

Register domain services via `@Configuration` classes organised by concern:
- `DataConfig` -- data source and repository wiring
- `ClientConfig` -- Feign client beans
- `PermissionsConfig` -- permissions registry

Keep the main application class clean -- it should only import top-level configs.

## Step 5: Set up data access

### JPA / SQL Server

1. Add `common-deployable-spring-boot-jpa` to `build.gradle`
2. Create entity classes implementing `AuditableEntity`; use `OffsetDateTime` for all date/time fields
3. Create repository interfaces extending `JpaRepository`; always scope queries by `environmentId`
4. Place Liquibase changesets in `src/main/resources/db/changelog/`; use descriptive IDs (e.g., `2024-01-15-add-example-table`)
5. All schema changes must be backwards-compatible -- old and new app versions run against the same DB during rolling deploy

### Cosmos DB (MongoDB API -- default)

1. Add `common-deployable-spring-boot-cosmos` to `build.gradle`
2. Create entity classes annotated with `@Document`; add `@Indexed` to `environmentId` (shard key)
3. Create repository interfaces extending `MongoRepository`
4. Place Cosmos credentials in `~/.azure/cosmos.config` for local dev
5. Set `cosmos.account.randomize-database-name=true` in test config to isolate test databases

### Cosmos DB (SQL API)

1. Add `common-deployable-spring-boot-cosmos-sql` to `build.gradle`
2. Create a config class extending `CommonCosmosSqlConfig` annotated with `@EnableCosmosRepositories`
3. Create entity classes annotated with `@Container`; use `@PartitionKey` on `environmentId`

## Step 6: Write your first controller

1. Create a `@RestController` in the `controller/` package; name it `*Resource` (e.g., `ExampleResource`)
2. Define path constants in a static nested `Path` class; never inline strings in annotations
3. Inject `RequestContext` for tenant identity; use `requestContext.getEnvironmentId()` as the tenant partition key
4. Annotate GET endpoints with `@ContentSecurityPolicy`
5. Annotate endpoints with `@PreAuthorize("isTrustedOrHasPermission('example.read')")` -- see `java.md` for the full expression table
6. Add `@SupportalResource` to employee-only endpoints and use `hasSupportalPermission(...)` in `@PreAuthorize`
7. Return `ResponseEntity.created(uri).body(dto)` for create operations
8. Throw framework exceptions (`NotFoundException`, `BadRequestException`, etc.) -- see `java.md` for the full table

### Scaffold permissions

Run `gw addPermissions` to scaffold a new `Permissions` class and registry stub, then register it in `PermissionsConfig`:

```java
@Configuration
public class PermissionsConfig {
    @Autowired private Permissions permissions;
    @Autowired private PermissionsRegistry registry;

    @PostConstruct
    public void registerPermissions() {
        registry.register(permissions);
    }
}
```

## Step 7: Write tests

Three layers -- write all tests in Groovy/Spock (JUnit 5 also supported):

1. **Unit tests** (`src/test/groovy/`) -- mock all external systems with `Mock()`; no Spring context
2. **CoreSpecs** (`src/coreTest/groovy/`) -- real Spring context + real DB; use `@CoreTest` and `ResettingMockInjector`
3. **Component tests** (`src/componentTest/groovy/`) -- `@SpringBootTest` + WireMock for external services; use `@RequiresBbAuthContext` / `@RequiresSasContext` for auth context

Test conventions:
- Test names must start with `"should"`: `def "should return the entity when found"()`
- Use `given:/when:/then:` blocks with a blank line between each
- Use `@Unroll` on all data-driven (`where:`) tests
- Use `aRandom.xxx().build()` from `CoreARandom` for all test data construction; never `new` domain objects directly

Run `gw test` for unit tests and `gw componentTest` for component/integration tests.

## Step 8: Configure OpenAPI

Springdoc auto-generates specs from your annotations. To expose on the SKY API developer portal:

1. Annotate the endpoint with `@SkyApiEnabled`
2. Add `@Operation(security = @SecurityRequirement(name = SecuritySchemes.BBID))`
3. Ensure `skyapi.service-title` and `skyapi.service-description` are set in `application.properties`

Write Swagger validation tests by extending `BaseSwaggerValidationSpec` from `common-test`. Commit the generated spec files to the repo.

## Step 9: Set up service-to-service auth (if needed)

If your service **calls other services**:

1. Configure SAS in ES Hub (see `auth.md` skill)
2. Create a Feign client interface and wire it in `ClientConfig` using `FeignClientBuilder` + `SasInterceptorBuilder`
3. Set up local SAS keys in a gitignored local properties file

If **other services call your service**:

1. Configure your service's SAS authorisation policy in ES Hub
2. Add the calling services to the policy

## Step 10: Go Live checklist

Before accepting client traffic, complete the Go Live process:

- [ ] Contact list on SCS up to date
- [ ] CI/CD pipeline passing; integration tests defined
- [ ] `/monitor` endpoint implemented -- validates connectivity to all dependencies (databases, downstream services, auth)
- [ ] All needed alerts enabled (Opsgenie)
- [ ] WAF enabled in Block mode
- [ ] Security assessment completed (App Security team) -- allow 2-4 weeks
- [ ] Compliance sign-off (PCI scope, PHI, cardholder data)
- [ ] Incident Management onboarded (Opsgenie team, alert schedule)
- [ ] Change Management approved (Standard Change Template via CRC/CAB)

Go Live is completed per zone (e.g., `p-usa01`, `p-eur01` separately). Start 2-3 weeks before you need to accept traffic.

**Reference:** https://docs.blackbaud.com/engineering-system-docs/learn/microservices/service-go-live

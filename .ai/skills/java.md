# Java

Blackbaud Java / Spring Boot service conventions.

## Creating a new service

Use the **Sky CLI** to scaffold a new Java service:

```shell
npm install -g @blackbaud-internal/sky-cli
sky ext update
sky new
```

`sky new` prompts for service details (SCS code, microservice name, etc.) and creates a Spring Boot skeleton with a working `build.gradle`, `settings.gradle`, CI/CD pipeline, and test directories.

Before running `sky new`, create the microservice in **Engineering System Hub** (ES Hub) under your SCS: Add new resource > New Microservice. Do not clone the repo before running `sky new` -- the command clones it for you.

**Gradle tasks added by the framework:**
- `gw addPermissions` -- scaffolds a permissions class and registry stub for a new permission
- `gw test` -- runs unit tests
- `gw componentTest` -- runs component / integration tests

## Platform baseline

All Blackbaud Java services use:

- **Java 17**
- **Spring Boot 3.x** (patch version controlled by the project template/common parent)
- **Gradle** (not Maven) for builds
- **Spock / Groovy** for tests (preferred; JUnit 5 also supported)
- Deployment on Kubernetes via the Engineering System

## Naming conventions

Blackbaud Java services share these class-naming patterns. Check the existing code base before introducing a new suffix — follow whatever the service already uses.

| Type | Convention | Example |
|------|-----------|---------|
| REST API DTOs | `*Request` / `*Response` | `ReceiptSettingsRequest` |
| JPA entities | `*Entity` | `GivingStatementEntity` |
| Repositories | `*Repository` | `GivingStatementRepository` |
| Service Bus handlers | `*MessageHandler` | `PdfJobCompletedMessageHandler` |
| MapStruct mappers | `*Mapper` | `ConsolidatedReceiptResponseMapper` |
| Custom exceptions | `*Exception` | `MergeFieldFormatException` |

**Service class names** are behaviour-driven and do not need to end with `Service`. Use a suffix that describes what the class does: `*Updater`, `*Fetcher`, `*Upserter`, `*Validator`, `*Processor`, `*Scheduler`. Use `*Service` only for a true general orchestrator.

**Method naming:**

| Prefix | Meaning |
|--------|---------|
| `getXxx()` | Property accessor only (Lombok-generated or equivalent). Do not use for queries or lookups. |
| `findXxx()` | Retrieve data that may or may not exist; return `Optional` or nullable. |
| `fetchXxx()` | Retrieve data that is expected to exist, from an external source. |
| `retrieveXxx()` | Retrieve data from the current system or context by key. |
| `createXxx()` | Insert or update something in the persistence layer. |
| `buildXxx()` | Construct an object or list in memory without persisting it. |

**Constants:** `UPPER_SNAKE_CASE`, grouped in static nested classes inside the owning class:

```java
public static final class Path {
    public static final String RECEIPTS = "/receipts";
    public static final String BULK = "/bulk";
}
public static final class Param {
    public static final String ENVIRONMENT_ID = "environmentId";
}
```

Never inline path strings in annotations — always reference the constant.

## common-deployable framework

All Blackbaud Java services are built on `common-deployable`, a Gradle multi-module library published to the internal Blackbaud feed as `com.blackbaud:common-deployable-*`. Include the appropriate modules in `build.gradle` based on your service's needs:

| Module | Artifact ID | Purpose |
|--------|-------------|---------|
| Base REST service | `common-deployable-spring-boot-rest` | MVC pipeline, JWT auth filter, permissions, OpenAPI |
| Core Spring Boot | `common-deployable-spring-boot` | Actuator health endpoints, Micrometer metrics, spring-retry |
| Exception types | `common-deployable-rest-api` | `BadRequestException`, `NotFoundException`, etc. |
| Feign clients | `common-deployable-rest-feign` | `FeignClientBuilder` for service-to-service calls with SAS auth |
| Cosmos DB (MongoDB) | `common-deployable-spring-boot-cosmos` | Spring Data Cosmos with MongoDB wire protocol, RU scaling |
| Cosmos DB (SQL) | `common-deployable-spring-boot-cosmos-sql` | Azure Cosmos DB SQL API, Spring Data |
| JPA / SQL Server | `common-deployable-spring-boot-jpa` | JPA, Hibernate, Liquibase migrations, auditable entities |
| Shared data utilities | `common-deployable-spring-boot-data` | Tracing/metrics for repositories, `CustomAuditingHandler`, `PageableBatchProcessor` |
| Structured logging | `common-logging` | Logback → Splunk structured logs |
| SAS auth | `sasquatch` | SAS request interceptors for outbound service calls |

### Version pinning

Use wildcard minor versions in `gradle.properties` to pick up bug fixes automatically:

```properties
commonDeployableVersion=21.+
commonLoggingVersion=7.+
commonTestVersion=10.+
sasquatchVersion=11.+
```

Then reference in `build.gradle`:

```groovy
dependencies {
    implementation "com.blackbaud:common-deployable-spring-boot-rest:${commonDeployableVersion}"
    implementation "com.blackbaud:common-logging:${commonLoggingVersion}"
    testImplementation "com.blackbaud:common-test:${commonTestVersion}"
    implementation "com.blackbaud:sasquatch:${sasquatchVersion}"
}
```

When testing a pre-release of a framework module, pin the exact version temporarily. Remove the pin before merging.

### Dependency-confusion mitigation

The `blackbaud-internal` Gradle plugin routes `com.blackbaud.*` dependency resolution exclusively through the internal Blackbaud Artifacts feed, preventing an attacker from shadowing internal packages by publishing the same name to Maven Central. The plugin is configured in `build.gradle`:

```groovy
blackbaud_internal {
    minBranchCoverage 77.00
}
```

Do not remove the `blackbaud_internal` block or override `com.blackbaud.*` resolution to point at Maven Central.

### Host setup

The main application class must import `WebMvcRestServiceConfig`. `sky new` scaffolds it with `@SpringBootApplication`:

```java
@SpringBootApplication
@Import(WebMvcRestServiceConfig.class)
public class MyServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(MyServiceApplication.class, args);
    }
}
```

Mature services often replace `@SpringBootApplication` with `@Configuration` + explicit `@ComponentScan` + `@Import` to give finer control over which packages are scanned and which configs are loaded:

```java
@Configuration
@ComponentScan("com.blackbaud.myservice.resources")
@Import({ CoreConfig.class, WebMvcRestServiceConfig.class, PermissionsConfig.class })
public class MyServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(MyServiceApplication.class, args);
    }
}
```

Either form is valid. Do not configure the JWT auth filter, exception handlers, OpenAPI, or request context manually — `WebMvcRestServiceConfig` handles all of these.

### Service registration

Use `@Configuration` classes organised by concern (e.g., `DataConfig`, `ClientConfig`, `PermissionsConfig`). Keep the main application class clean -- it should only import top-level configs, not contain registration logic.

## Project structure

```text
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

Keep HTTP concerns (controllers, request context, permissions) out of the service and repository layers.

### Test directories

| Directory | Purpose |
|-----------|---------|
| `src/test/groovy/` | Spock unit tests (fast, no real I/O) |
| `src/coreTest/groovy/` | DB-backed integration tests with a real Spring context (`*CoreSpec.groovy`) — present in services that use `common-test` |
| `src/componentTest/groovy/` | Component/integration tests (with WireMock, real DB or in-memory) |
| `src/mainTest/groovy/` | Shared test utilities reused across test directories |

## Data models

### Lombok on DTOs

When the project uses Lombok, apply these annotations consistently on data-transfer and response objects:

```java
@Data
@Builder(toBuilder = true)
@NoArgsConstructor
@AllArgsConstructor
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public class ExampleResponse {
    private UUID id;
    private String environmentId;
}
```

Use `@Builder(toBuilder = true)` on any class that needs to be copied with modifications. Use `@Slf4j` on any class that needs a logger.

**PII fields must never appear in logs.** Exclude them from `toString` with `@ToString.Exclude`:

```java
@ToString.Exclude
private String emailAddress;
```

For Service Bus message payloads, also annotate PII fields with `@PiiData` so they are redacted in the ACB dead-letter viewer.

### MapStruct for entity-to-DTO mapping

When the project uses MapStruct, never map manually. Write a mapper interface:

```java
@Mapper(componentModel = "spring", config = ErrorUnmappedMapperConfig.class)
public interface ExampleResponseMapper {
    @Mapping(target = "displayName", source = "name")
    ExampleResponse toApi(ExampleEntity source);
}
```

- Always use `config = ErrorUnmappedMapperConfig.class` to get a compile-time error for any unmapped field.
- Use `toApi()`, `toEntity()`, and `toInternal()` as converter method names for consistency.

## Configuration

### Configuration files

| File | Purpose | Committed? |
|------|---------|------------|
| `src/main/resources/application.properties` | Base configuration | Yes |
| `src/main/resources/application-local.properties` | Local dev overrides -- **no secrets** | Yes |
| `~/.azure/cosmos.config` | Cosmos DB account credentials for local dev | No -- per-developer |

For secrets locally (SAS keys, connection strings), use environment variables or a gitignored local file. Do not put secrets in any committed file.

### Key configuration properties

```properties
# Service identity (required for SAS auth)
service.name=my-service-name
server.servlet.context-path=/my-service

# OpenAPI metadata
api.title=My Service
api.description=Brief description of my service
api.version=1.0

# SKY API exposure
skyapi.service-title=My Service
skyapi.service-description=Brief description
```

### Secrets management

Get Cosmos account keys, SAS keys, and Service Bus connection strings from **ES Compose** or **CyberArk**. For local development:

- Cosmos DB: place account name and key in `~/.azure/cosmos.config` (picked up automatically by the cosmos modules)
- Other secrets: use environment variables or a gitignored local properties file

## Data access -- JPA / SQL Server

Include `common-deployable-spring-boot-jpa` for SQL Server databases. Liquibase manages schema migrations.

### Entities

Implement `AuditableEntity` to get automatic `createdBy`, `createdDate`, `lastModifiedBy`, `lastModifiedDate` audit fields:

```java
@Entity
@Table(name = "example")
public class ExampleEntity implements AuditableEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String environmentId;
    // ... other fields
}
```

The implicit naming strategy converts camelCase fields to snake_case column names automatically. Do not add `@Column(name = "...")` for the common case.

Use `OffsetDateTime` (not `LocalDateTime` or `Date`) for all date/time columns. Store and transmit in UTC to avoid time zone ambiguity.

### Tenant scoping

Always scope reads and writes by `environmentId`. Never query tenant-owned data by `id` alone:

```java
// Correct -- scoped to tenant
Optional<ExampleEntity> findByEnvironmentIdAndId(String environmentId, Long id);

// Wrong -- crosses tenant boundaries
Optional<ExampleEntity> findById(Long id);
```

### Migrations

Place Liquibase changesets in `src/main/resources/db/changelog/`. Each changeset must have a unique `id` and `author`. Use descriptive IDs (e.g., `2024-01-15-add-example-table`), not sequential integers. Do not change database schema outside of Liquibase.

**All schema changes must be backwards-compatible.** Both the old and new application version will run against the same database during a rolling deployment. Never rename or remove a column/table in the same release that the application stops referencing it. Instead, deploy in two steps:
1. Deploy the app change that stops referencing the old field.
2. In a follow-up release, add a migration to drop the now-unused field.

### Repositories

```java
public interface ExampleRepository extends JpaRepository<ExampleEntity, Long> {
    List<ExampleEntity> findByEnvironmentId(String environmentId);
    Optional<ExampleEntity> findByEnvironmentIdAndId(String environmentId, Long id);
}
```

Prefer Spring Data method-name queries (e.g., `findByEnvironmentIdAndStatus`). Use `@Query` only for operations too complex to express as a method name:

```java
@Modifying
@Query("DELETE FROM ExampleEntity WHERE environmentId = :environmentId")
int deleteAllByEnvironmentId(@Param("environmentId") String environmentId);
```

Prefix non-JPA methods (those annotated with `@Query`) with `custom` to make it clear they are not parsed as Spring Data method-name queries, and to prevent silent misconfiguration if the wrong `@Query` annotation import is used:

```java
// Good — unambiguously custom
@Query("SELECT e FROM ExampleEntity e WHERE ...")
List<ExampleEntity> customFindRecentByEnvironmentId(String environmentId);
```

### Auditing bypass

To preserve existing audit data (e.g., during migrations), wrap persistence calls in `CustomAuditingHandler.bypass`:

```java
ExampleEntity saved = CustomAuditingHandler.bypass(() -> repository.save(entity));
```

## Data access -- Cosmos DB

### MongoDB API (common-deployable-spring-boot-cosmos)

Use the MongoDB wire protocol for most Cosmos DB workloads. Repositories extend `MongoRepository`:

```java
@Repository
public interface ExampleRepository extends MongoRepository<ExampleEntity, String> {
    List<ExampleEntity> findByEnvironmentId(String environmentId);
}
```

```java
@Document(collection = ExampleEntity.COLLECTION_NAME)
public class ExampleEntity {
    public static final String COLLECTION_NAME = "example";

    @Id
    private String id;
    @Indexed
    private String environmentId;  // shard key -- always scope queries by this
}
```

Local dev: place account credentials in `~/.azure/cosmos.config`:

```properties
cosmos.account.name=my-cosmos-account
cosmos.account.key=my-account-key
```

Set `cosmos.account.randomize-database-name=true` in test configuration to isolate test databases.

### SQL API (common-deployable-spring-boot-cosmos-sql)

Use when you need SQL query semantics. Configure with `@EnableCosmosRepositories`:

```java
@Configuration
@EnableCosmosRepositories(basePackages = {"com.blackbaud.example.repository"})
public class CosmosSqlConfig extends CommonCosmosSqlConfig {
}
```

```java
@Container(containerName = ExampleEntity.COLLECTION_NAME)
public class ExampleEntity {
    public static final String COLLECTION_NAME = "example";

    @Id
    @GeneratedValue
    private String id;
    @PartitionKey
    private String environmentId;
    @Version
    private String version;
    @CreatedDate
    private OffsetDateTime createdDate;
    @LastModifiedDate
    private OffsetDateTime lastModifiedDate;

    private String exampleText;
}
```

**Note on BigDecimal:** `azure-spring-data-cosmos` drops trailing zeros from `BigDecimal` values (e.g., `234.50` → `234.5`). Annotate `BigDecimal` fields with `@JsonSerialize(using = BigDecimalMoneySerializer.class)` / `@JsonDeserialize(using = BigDecimalMoneyDeserializer.class)` if scale precision is required.

## Error handling

Throw exception types from `com.blackbaud.boot.exception` (included via `common-deployable-rest-api`). The framework converts these to RFC 7807 `application/problem+json` responses.

| Scenario | Exception | HTTP |
|----------|-----------|------|
| Bad input from caller | `BadRequestException` | 400 |
| Unauthenticated | `NotAuthorizedException` | 401 |
| Authorization failure | `ForbiddenException` | 403 |
| Resource missing | `NotFoundException` | 404 |
| Conflict with current state | `ConflictException` | 409 |
| Resource permanently gone | `GoneException` | 410 |
| Precondition (ETag) mismatch | `PreconditionFailedException` | 412 |
| Unexpected server error | `InternalServerException` | 500 |
| Upstream timeout | `GatewayTimeoutException` | 504 |

All extend `WebApplicationException`. Use `ProblemDetails` (not the deprecated `ErrorCodes` / `ErrorEntity`) for structured error bodies.

**Key rules:**
- Throw `NotFoundException` from the service/repository layer when a record is not found. Do not return `null` and let controllers check for it.
- Do not throw `InternalServerException` for generic database errors -- let them bubble to the framework's uncaught-exception handler (returns 500 problem+json).
- Do not catch HTTP 429 (throttling) from Cosmos DB -- the SDK handles retries automatically.

## Controllers

Inject `RequestContext` to access tenant and user identity from the validated JWT. Do not read claims directly from `HttpServletRequest`:

```java
@RestController
@RequestMapping(path = ExampleResource.Path.ROOT, produces = MediaType.APPLICATION_JSON_VALUE)
public class ExampleResource {

    public static final class Path {
        public static final String ROOT = "/v1/examples";
        public static final String BY_ID = "/{id}";
    }

    private final ExampleService service;
    private final RequestContext requestContext;

    public ExampleResource(ExampleService service, RequestContext requestContext) {
        this.service = service;
        this.requestContext = requestContext;
    }

    @ContentSecurityPolicy
    @GetMapping(Path.BY_ID)
    @PreAuthorize("isTrustedOrHasPermission('example.read')")
    public ResponseEntity<ExampleDto> getById(@PathVariable Long id) {
        return ResponseEntity.ok(service.getById(requestContext.getEnvironmentId(), id));
    }
}
```

- Always set `produces = MediaType.APPLICATION_JSON_VALUE` at the class level.
- Always add `@ContentSecurityPolicy` to GET endpoints that may be browser-consumed.
- Define all path strings as constants in a static nested `Path` class; never inline strings.

Use `requestContext.getEnvironmentId()` as the tenant partition key passed to repositories.

Return `ResponseEntity.created(uri).body(dto)` for create operations.

### Permissions

Define permissions by extending `AbstractPermissions` and registering with `PermissionsRegistry` in a `@Configuration` class:

```java
@Component
public class Permissions extends AbstractPermissions {
    public static final String EXAMPLE_READ = "example.read";
    public static final String EXAMPLE_WRITE = "example.write";
}

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

Use `gw addPermissions` to scaffold new permission classes.

### Authorization annotations

Annotate controller methods with `@PreAuthorize` using the custom permission evaluators provided by `WebMvcRestServiceConfig`:

| Expression | Grants access when |
|------------|-------------------|
| `isTrustedOrHasPermission('perm.name')` | SAS token (service-to-service, trusted -- permission check **bypassed**), OR BBID user has the named permission |
| `hasPermission('perm.name')` | Caller has the named permission -- applies to **both** SAS and BBID (SAS not automatically trusted) |
| `hasBbAuthPermission('perm.name')` | BBID user has the named permission -- SAS rejected |
| `hasSupportalPermission('perm.name')` | Blackbaud employee with the named permission (Supportal only) |
| `hasUserClaimValue('claimName', 'value')` | User JWT carries a specific claim value |

Use `isTrustedOrHasPermission` for most endpoints so that backend service-to-service SAS calls are not blocked by user-permission checks. Use `hasBbAuthPermission` or `hasPermission` when SAS callers must also hold explicit permissions.

For employee-only (Supportal) endpoints, use `hasSupportalPermission`. These do not appear in the SKY API spec. Also annotate the controller method with `@SupportalResource` to prevent the endpoint from appearing in the public Swagger UI for non-employee audiences.

### Input validation

Validate request body DTOs at the controller boundary using Bean Validation. Annotate the parameter with `@Valid`; the framework translates `ConstraintViolationException` to a 400 response:

```java
@PostMapping
public ResponseEntity<ExampleDto> create(@Valid @RequestBody CreateExampleRequest request) { ... }
```

## OpenAPI

Springdoc (`springdoc-openapi`) generates the OpenAPI specs. Multiple spec documents are served by auth scheme:

| URL | Audience |
|-----|---------|
| `/v3/api-docs` | All endpoints |
| `/v3/api-docs/sas` | SAS-authenticated endpoints |
| `/v3/api-docs/bbid` | BBID-authenticated endpoints |
| `/v3/api-docs/skyapi` | SKY API public endpoints |
| `/v3/api-docs/supportal` | Employee (Supportal) endpoints |
| `/swagger-ui.html` | Interactive UI |

To expose endpoints on the SKY API developer portal:
1. Annotate with `@SkyApiEnabled`
2. Annotate the operation with `@Operation(security = @SecurityRequirement(name = SecuritySchemes.BBID))`
3. Configure `skyapi.service-title` and `skyapi.service-description` in `application.properties`

```java
@SkyApiEnabled
@Operation(security = @SecurityRequirement(name = SecuritySchemes.BBID))
@GetMapping("/{id}")
public ResponseEntity<ExampleDto> getById(@PathVariable Long id) { ... }
```

Write OpenAPI validation tests by extending `BaseSwaggerValidationSpec` from `common-test`. Commit the generated spec files to the repo.

## Service clients -- calling other services

Use `FeignClientBuilder` from `common-deployable-rest-feign` with a `sasquatch` interceptor for service-to-service calls. The interface uses native Feign annotations (`@RequestLine`, `@Param`, `@QueryMap`):

```java
public interface ExampleClient {
    String SERVICE_TYPE = "example-service";

    @RequestLine("GET /example-service/v1/examples/{id}")
    ExampleDto getById(@Param("id") String id);

    @RequestLine("GET /example-service/v1/examples")
    List<ExampleDto> find(@QueryMap ExampleFilter filter);
}
```

Wire up the client as a Spring bean:

```java
@Configuration
public class ClientConfig {
    @Autowired private FeignClientBuilder feignClientBuilder;
    @Autowired private SasInterceptorBuilder sasInterceptorBuilder;

    @Bean
    public ExampleClient exampleClient() {
        RequestInterceptor interceptor = sasInterceptorBuilder.buildForCurrentZone(ExampleClient.SERVICE_TYPE);
        return feignClientBuilder
                .requestInterceptor(interceptor)
                .target(ExampleClient.class);
    }
}
```

Query parameter keys from `@QueryMap` POJOs default to snake_case. Annotate the POJO with `@JsonNaming` if you need lower camelCase keys.

For proxy scenarios where upstream 500s should be forwarded instead of wrapped, call `.propagateInternalServerErrorAtLogLevel(LogLevel.INFO)` on the builder.

To avoid logging PII, exclude sensitive fields from `toString` or annotate with `@JsonMask` when using JSON payload logging.

## Logging and observability

- **Logging:** `common-logging` provides structured Logback appenders that ship to **Splunk**. Use standard SLF4J `LoggerFactory.getLogger(MyClass.class)` -- the framework configures sinks automatically. **Splunk retention:** `info` logs are kept for 30 days; `error`, `warn`, and `debug` logs are kept for 90 days. If an `info` log must be retained beyond 30 days, discuss with the team and use `SecurityRelated`/`makeSecurityRelated()` rather than changing the log level. Do not change log level to `debug` solely to extend retention — `debug` is for debugging only.
- **Tracing:** OpenTelemetry spans ship to **Honeycomb**. No manual setup required -- the `azure-core-tracing-opentelemetry` bridge auto-discovers via `ServiceLoader` and instruments HTTP requests, Cosmos DB operations, and Service Bus.
- **Metrics:** Micrometer + Prometheus metrics are exposed by `common-deployable-spring-boot`. Repository-level metrics are available via `common-deployable-spring-boot-data` but are disabled by default to minimise Azure Log Analytics costs:

```properties
# Enable if needed for dashboards
management.metrics.enable.bb.repository.db=true
management.metrics.enable.bb.repository.cosmos=true
```

- **`/version` endpoint:** Auto-created by `common-deployable`. Returns the current deployed version of the service. Useful for confirming which version of the code is running.
- **`/monitor` endpoint:** Auto-created by `common-deployable`. Intended for self-health checks — validate connectivity to all dependencies (databases, downstream services, auth). Returns `200` when all checks pass, `500` when any check fails. **The Upsilon release pipeline hits `/monitor` after deployment to gate promotion to production.** Application Insights probes it continuously to trigger on-call alerts. The framework automatically registers auth-connectivity checks into `/monitor`; add service-specific checks for your databases and clients.
- **Diagnostic endpoints:** `/bbdiagnostic/` (thread dump, netstat, flight recorder, heap dump) are exposed by the framework and gated by the `bbdiagnostic` permission. These are employee-only and safe to leave enabled.

## Messaging -- Service Bus

Use the framework's Service Bus integration from `common-deployable-spring-boot`. The OpenTelemetry bridge automatically instruments spans. Do not use the raw Azure Service Bus SDK without the framework wrappers.

### Handler pattern

A Service Bus topic consumer typically consists of:

| File | Purpose |
|------|---------|
| `*ServiceBusProperties.java` | Binds `servicebus.<topic-name>.*` config properties |
| `*MessageHandler.java` | Entry point — receives the raw message, optionally guards with `accepts()`, and delegates to a processor |
| `*Processor.java` / `*ProcessorFactory.java` | Strategy interface and factory when a topic requires different behaviour based on message content |
| Concrete `*Processor` impls | `@Component("<TYPE>")` beans implementing the processor interface, resolved by the factory |

Register handler and consumer beans in a central `ServiceBusConfig` using `ServiceBusConsumerBuilder`:

```java
@Bean
public ExampleMessageHandler exampleMessageHandler() {
    return new ExampleMessageHandler();
}

@Bean
@Profile("!vstsTest")
public ServiceBusConsumer exampleConsumer(
        ServiceBusConsumerBuilder.Factory factory,
        ExampleMessageHandler handler,
        ExampleServiceBusProperties properties) {
    return factory.create()
            .dataSyncTopicServiceBus(properties)
            .jsonMessageHandler(handler, ExamplePayload.class)
            .build();
}
```

### Key rules

- Bind all topic names, subscription names, and connection strings via `*ServiceBusProperties` from config. Never hard-code them.
- Use `@Profile("!vstsTest")` on any consumer bean that must not run in the pipeline test environment.
- Throw `RetryableProcessException` for transient failures — the framework will retry.
- Throw `DeadLetterException` for unrecoverable failures (invalid payload, missing required fields) — the framework dead-letters the message.
- Use `accepts()` on a handler when filtering is needed before processing.
- Do not log on every message for high-traffic topics. Log at timed intervals using an accumulated metric to avoid significant performance degradation at volume.

## Testing

### Spock (preferred)

Write tests in Groovy using Spock. Spock's given/when/then blocks, `@Unroll`, and `where` tables make intent clear:

```groovy
class ExampleServiceSpec extends Specification {

    ExampleRepository repository = Mock()
    ExampleService service = new ExampleService(repository)

    def "should return the entity when found by id"() {
        given:
        def entity = new ExampleEntity(id: 1L, environmentId: "env-1")
        repository.findByEnvironmentIdAndId("env-1", 1L) >> Optional.of(entity)

        when:
        def result = service.getById("env-1", 1L)

        then:
        result.id == 1L
    }

    @Unroll
    def "should throw NotFoundException when entity is #scenario"() {
        given:
        repository.findByEnvironmentIdAndId("env-1", 1L) >> Optional.empty()

        when:
        service.getById("env-1", 1L)

        then:
        thrown(NotFoundException)

        where:
        scenario << ['missing', 'deleted']
    }
}
```

- **Test names start with "should"** — e.g., `def "should return the entity when found"()`.
- **AAA structure** — use `given:/when:/then:` blocks as the Arrange/Act/Assert boundaries and leave a blank line between each block. Never collapse them onto a single line.
- Use `@Unroll` on all data-driven (`where:`) tests.
- Always use `given:/when:/then:` or `given:/expect:` blocks — never skip them.
- Always use explicit `assert` statements in `expect:` blocks.
- Prefer `orElseThrow()` at the service level over null checks in the controller.

JUnit 5 is also supported for teams that prefer it.

### Test layers

| Layer | What it tests | How |
|-------|---------------|-----|
| **Unit tests** | Pure logic with no Spring context or I/O | Mock external systems and framework boundaries with Spock `Mock()` |
| **CoreSpecs** (if present) | Behaviour with real Spring context and real DB (`*CoreSpec.groovy`) | Annotate with `@CoreTest`; use `ResettingMockInjector` to swap Autowired fields for Spock mocks |
| **Component tests** | Full request pipeline, auth, permissions | `@SpringBootTest` with WireMock for external services |
| **Repository tests** | Data access against a real or emulator database | Use `cosmos.account.randomize-database-name=true` for Cosmos isolation |

**Prefer testing your own classes with real instances.** Mock external systems, framework boundaries, and expensive collaborators. Avoid mocking the class under test or large portions of your own domain model — this couples tests to implementation details.

### Test data builders

When the project provides a `CoreARandom` class (from `common-test`), use it to construct all test objects. Never construct test objects directly with `new` when a builder is available:

```groovy
static CoreARandom aRandom = new CoreARandom()

ExampleEntity entity = aRandom.exampleEntity().environmentId("env-1").build()
List items = aRandom.nonEmptyList({ aRandom.exampleEntity().build() })
```

Add new random builders to `CoreARandom` via `@Delegate` when introducing new domain objects.

### Auth context in component tests

Use annotations from `common-test` to inject auth context. Do not hand-craft JWTs:

```groovy
@RequiresBbAuthContext   // injects a BBID user context
@RequiresSasContext      // injects a SAS token context
```

### WireMock

Use WireMock to stub external service calls in component tests.

### Code coverage

Coverage threshold is configured per-service in `build.gradle` (the template default is `77.00`). Use coverage exclusions only on framework wiring (main class, config classes, trivial plumbing) -- never on business logic.

### Static analysis (Java)

PMD (including Copy-Paste Detector) runs automatically as part of `./gradlew check`. It enforces the rules defined in `default-blackbaud-ruleset.xml` in the `gradle-internal` repo. Fix all violations; do not suppress them. Findbugs is optional but recommended — run with `./gradlew findbugsAll`.

### CodeNarc (Groovy style)

Run `./gradlew clean codenarc` before merging. CodeNarc enforces class/method size limits, cyclomatic complexity, and no unused imports. Fix violations; do not suppress them.

In Spock spec files, always declare `@Autowired` beans and mock class variables as `private`. Without the `private` modifier, CodeNarc cannot detect unused fields:

```groovy
class ExampleCoreSpec extends Specification {

    @Autowired
    private ExampleRepository repository

    private ExampleService mockService
}
```

## Code comments

Do not add comments that describe what the code does — the code must explain itself. Add comments only to explain *why* a non-obvious decision was made.

TODO comments must always include a link to the ADO work item so the work can be found when that item is picked up:

```java
// TODO: Remove workaround once upstream API supports batch deletes.
// https://dev.azure.com/Blackbaud/Products/_workitems/edit/1234567
```

## Reference repositories

When documentation is insufficient, browse these repos for concrete examples:

| Repo | Purpose |
|------|---------|
| `common-deployable` | Source for all `com.blackbaud:common-deployable-*` modules |
| `sasquatch` | SAS auth library and request interceptors |
| `gradle-templates` | Gradle plugin providing `addPermissions` and other framework tasks |
| `common-logging` | Logback-to-Splunk configuration source |

When you need to understand how a `common-deployable` module works (method signatures, config properties, available annotations), search the `common-deployable` repository source before guessing.

## Anti-patterns

Do not:
- Override or manually configure beans provided by `WebMvcRestServiceConfig`. The framework wires the auth filter, exception handlers, and OpenAPI.
- Read tenant claims directly from `HttpServletRequest`. Use `requestContext.getEnvironmentId()`.
- Return `null` from service methods when a record is not found. Throw `NotFoundException`.
- Query tenant-owned data without scoping by `environmentId`. Always include it in repository method parameters and query conditions.
- Change database schema outside of Liquibase migrations.
- Catch HTTP 429 (throttling) from Cosmos DB. The SDK handles retries automatically.
- Remove the `blackbaud_internal` block from `build.gradle`. It prevents dependency-confusion supply-chain attacks.
- Apply coverage exclusions to business logic. Restrict them to framework wiring (main class, config classes, trivial plumbing).
- Hand-craft JWTs for auth tests. Use `@RequiresBbAuthContext` / `@RequiresSasContext` from `common-test`.
- Write direct Azure SDK integrations (Cosmos, Service Bus) without the `common-deployable` wrappers.
- Use `ErrorCodes` or `ErrorEntity` for error responses. Use `ProblemDetails`.
- Put secrets in committed files. Use environment variables or `~/.azure/cosmos.config` for local dev.
- Mock your own service or domain classes in tests. Mock external dependencies (third-party clients, framework interfaces, databases) instead.
- Hard-code Service Bus topic names or connection strings. Bind them from `*ServiceBusProperties`.

# Authentication and Authorisation

Blackbaud authentication, authorisation, and service-to-service trust patterns.

## BBID (Blackbaud Identity)

BBID is the organisation-wide identity provider. All user-facing services must authenticate via BBID.

- Use the **BB Auth SDK** for integration
- Tokens carry claims including tenant context (`environmentId`), user identity, and entitlements
- Feature toggles for phased rollouts (e.g., admin logins first, then constituent-facing)

### Token audiences

- `"blackbaud"` -- generic BBID audience (broad access, use for internal/employee-only tools)
- Custom audiences -- register via BBID when the service needs scoped access

### Request context

Tenant identity comes from `IRequestContext.EnvironmentId` (the BBID environment claim). Always use the framework's request context abstraction -- do not read claims directly from `HttpContext` or the raw JWT.

### Auth attributes (.NET)

| Attribute | Purpose |
|-----------|---------|
| `[SupportalEndpoint(null)]` | Employee-only BBID auth, no scope check |
| `[Authorize(AuthenticationSchemes = "SAS")]` | SAS-only auth for service-to-service calls |
| `[HasPermission(Permissions.SomeScope)]` | Scope-based auth using registered entitlements |

## Entitlements

Scope-based access control. Entitlements define what a user can do within a tenant.

### Scope format

- Internal services: `{scope}.{permission}` -- e.g., `Campaigns.Read`, `Campaigns.Write`, `Campaigns.Delete`
- SKY API scopes: shorter format -- e.g., `donf.r` (read), `donf.w` (write), `donf.d` (delete)

### Registering scopes

1. Define scopes in `Permissions/Permissions.cs` in your service repo
2. Point `skyconfig.json` `permissionsResolver.filePath` at this file
3. The ES build composes service permissions into BBID
4. Use `sky axs permissions generate` to generate the permissions enum

### Entitlements cache client

For services that need to check another user's entitlements (not the calling user), use `Blackbaud.Entitlements.CacheClient`:

```csharp
services.AddEntitlementsCacheService();
```

Your service must be registered as an authorised client of `etz-relay`. The library provides:
- REST client to etz-relay for access tokens
- Blobstore client for querying cached entitlements
- Automatic token management

Repository: `entitlements-cache-client-dotnet`

## Service-to-service auth (SAS)

SAS (Shared Access Signatures) is the standard for synchronous service-to-service calls.

### How it works

1. The calling service presents a SAS token with each request
2. The provider service validates the token against its authorisation policy
3. Trust is established through ES-managed key rotation

### Configuring SAS (provider side)

1. In ES Hub, open your SCS and click "Configure SAS"
2. Add the calling service to your authorisation policy
3. The policy can contain multiple configurators for BBID and SAS access

### Configuring SAS (client side)

1. Add the provider service to `skyconfig.json` `serviceClients`:
   ```json
   "serviceClients": [
     {
       "serviceName": "ExampleService",
       "swaggerUrl": "https://{scs}-{stack}.app.blackbaud.net/{service}/swagger/{auth}/swagger.json"
     }
   ]
   ```
2. The build generates a typed client class via NSwag
3. For local development, add the SAS key to `appsettings.secrets.json`:
   ```json
   {
     "ServiceClients": {
       "Shared": {
         "ClientName": "{Pod}\\{ServiceType}",
         "ServiceAccessKey": "{your-local-SAS-key}"
       }
     }
   }
   ```
4. Get SAS keys from **CyberArk** or the ES SAS configuration page

### SAS in SPAs

SPAs do not use SAS directly. The SPA authenticates via BBID, then calls the backend service which uses SAS for any downstream service-to-service calls. The SPA's generated service clients use `skyAuthHttpOptions()` to attach the BBID bearer token automatically.

## Service Bus trust

For async communication, trust is established by the Service Bus topology itself -- only authorised services can publish to or subscribe to a topic. No additional auth token exchange is needed.

Configure topics and contracts in `skyconfig.json`:

```json
"asyncTopics": [
  {
    "topic_name": "my-topic",
    "consuming": [
      {
        "contract_name": "MyContract",
        "version": 1
      }
    ]
  }
]
```

Run `sky engsys contracts generate` to generate the async contract brokers and update appsettings.

## Anti-patterns

Do not:
- Accept tenant ID from client input without BBID token validation. Always use `IRequestContext.EnvironmentId`.
- Hand-craft JWTs for testing. Use `Blackbaud.Testing` auth helpers (`WithBBIDAuthorization()`, `WithBBIDBlackbaudEmployeeAuthorization(envId)`).
- Store SAS keys in code, config files committed to git, or environment variables. Use `appsettings.secrets.json` (gitignored) or Azure Key Vault.
- Implement custom auth middleware. Use the framework's `ConfigureBlackbaud` pipeline which handles all auth schemes.
- Skip entitlement scope registration. Even if the service initially uses `[SupportalEndpoint(null)]`, define the intended scopes in `Permissions.cs` so they are ready when BBID registration is complete.

# Service Bus

Azure Service Bus messaging patterns at Blackbaud.

## When to use Service Bus

Service Bus is the **default** for inter-service communication at Blackbaud. Use it when:

- Event-driven workflows where eventual consistency is acceptable
- Fire-and-forget notifications
- Cross-service data propagation
- Decoupling producers from consumers

Use REST (synchronous) only when the caller needs an immediate answer or the downstream system only supports HTTP (e.g., third-party webhooks).

## Topics and contracts

Blackbaud uses a topic-based publish/subscribe model. Topics are shared infrastructure; contracts define the message schema.

### Configuration

Define topics and contracts in `skyconfig.json`:

**Publishing (producer):**
```json
"asyncTopics": [
  {
    "topic_name": "my-topic",
    "publishing": [
      {
        "contract_name": "MyEventContract",
        "version": 1
      }
    ]
  }
]
```

**Consuming (subscriber):**
```json
"asyncTopics": [
  {
    "topic_name": "my-topic",
    "consuming": [
      {
        "contract_name": "MyEventContract",
        "version": 1
      }
    ]
  }
]
```

### Code generation

Run `sky engsys contracts generate` after updating `skyconfig.json`. This generates:
- Async contract broker classes
- Required `appsettings.json` configuration sections

## Worker services

For services that process Service Bus messages, use a .NET Worker Service (`BackgroundService` / `IHostedService`) in a separate project alongside the web API:

| Project | Purpose |
|---------|---------|
| `Blackbaud.{Domain}.Service` | Web API (controllers, HTTP endpoints) |
| `Blackbaud.{Domain}.Listener.Worker` | Worker service (Service Bus message handlers) |

Both projects share the Domain project for business logic.

## Local development

For local development, configure a personal Service Bus namespace in `appsettings.secrets.json`:

```json
{
  "ServiceBus": {
    "Send": "{your-dev-service-bus-connection-string}",
    "Listen": "{your-dev-service-bus-connection-string}"
  }
}
```

## Shared library

`Blackbaud.Core.ServiceBus` (repository: `core-servicebus`) provides the standard Service Bus integration. Use it instead of the raw Azure SDK.

## Anti-patterns

Do not:
- Use synchronous REST when Service Bus would work. Default to async.
- Implement custom retry logic for message processing. The framework and Service Bus SDK handle retries and dead-lettering.
- Share connection strings between services. Each service has its own credentials.
- Skip contract versioning. Always specify a version number -- it enables non-breaking schema evolution.

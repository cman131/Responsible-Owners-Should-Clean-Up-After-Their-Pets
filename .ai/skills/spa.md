# SPA

Blackbaud frontend standards -- Angular, SKY UX, component patterns.

## SKY UX component instructions

The SKY UX team maintains their own agent guidance for component usage, testing, and styling. Do not duplicate their content -- use their source directly.

### Preferred: SKY UX MCP server

If the workspace is on `@blackbaud-internal/skyux-angular-builders@14.5.0` or later, check whether the SKY UX MCP server is configured. If it is, use it as the primary source for all SKY UX component APIs, patterns, and testing guidance -- it provides live, version-specific guidance matched to the exact SKY UX version installed.

If the MCP server is not set up and the user wants it, run:

```shell
ng generate @blackbaud-internal/skyux-angular-builders:ai-instructions
```

This configures the MCP server, adds an `AGENTS.md`, and removes stale static instruction files.

### Fallback: static instruction files

If the MCP server is not available (older builder version, or tool does not support MCP):

1. Look for `.github/skyux-base-instructions.md` in the repo -- the SKY UX team's static instruction file for component APIs, testing harnesses, and styling rules.
2. If it exists, read it and follow it. It takes precedence over general Angular guidance for SKY UX component usage.
3. If neither MCP nor static file is available, verify SKY UX component APIs against the **SKY UX Documentation** wiki (ADO `search_wiki` with `wiki: ["SKY UX Documentation"]`) before implementation. Do not assume component properties, inputs, or outputs from training data.

Similarly, check for `.github/testing-instructions.md` for test-specific patterns and `.github/copilot-instructions.md` for Angular conventions.

This skill covers the Blackbaud SPA infrastructure that wraps around SKY UX -- build tooling, shell integration, auth, registry, and deployment patterns.

## Private npm registry

`@blackbaud-internal` packages are hosted on the Blackbaud Azure DevOps npm feed. Authentication is required before `npm install` will work.

### Setup

Configure the registry in the user-level `~/.npmrc` (not a project-level `.npmrc`). This is a one-time setup per machine and works across all repos. Authenticate with:

```shell
npx vsts-npm-auth -config ~/.npmrc
```

This prompts for Azure DevOps credentials and writes a token to `~/.npmrc`. Re-run when the token expires.

If `vsts-npm-auth` is not available, install it globally first:

```shell
npm install -g vsts-npm-auth --registry https://registry.npmjs.com --always-auth false
```

### Feed URL

The Blackbaud npm feed registry URL is:

```text
https://pkgs.dev.azure.com/blackbaud/_packaging/Blackbaud-npm/npm/registry/
```

## Build tooling

Blackbaud SPAs use a custom Angular builder: `@blackbaud-internal/skyux-angular-builders`. This replaces the standard `@angular-devkit/build-angular` in `angular.json`.

The custom builder provides:
- `skyuxconfig.json` integration (reads config at build/serve time)
- SKY UX theme CSS bundling
- Local dev certificate management for HTTPS
- Module federation support (for micro-frontend architectures)

Standard commands:

```shell
npm run start    # Dev server (requires SKY UX certs)
npm run build    # Production build
npm run lint     # ESLint
npm run test     # Karma/Jasmine tests
npm run watch    # Build with watch mode
```

### Local dev certificates

The dev server requires HTTPS certificates. Install them once:

```shell
npx @blackbaud-internal/skyux-cli certs install
```

## skyuxconfig.json

`skyuxconfig.json` is the SPA equivalent of `skyconfig.json` for backend services. It configures the SKY UX shell, auth, theming, and runtime behaviour.

Key settings:
- `host` -- host URL configuration
- `auth` -- enable/disable BBID authentication
- `app.theming.theme.name` -- SKY UX theme (typically `"modern"`)
- Omnibar configuration (navigation, help widget)
- Content Security Policy (CSP) and frame options
- `envId` and other required query parameters

The custom builder reads `skyuxconfig.json` at build/serve time and makes the config available via `SkyAppConfigService` (injectable Angular service).

## Shell and auth

### Bootstrap

Blackbaud SPAs use `provideSkyux()` from `@blackbaud-internal/skyux-shell` to bootstrap shell integration:

```typescript
// main.ts or app.config.ts
provideSkyux()
```

`provideSkyux()` bundles:
- `provideSkyAuth()` -- BBID authentication
- `provideSkyAuthHttpClient()` -- HTTP interceptor that attaches auth tokens
- `provideSkyShell()` -- omnibar, help widget, navigation
- `provideSkyAppConfig()` -- runtime configuration from `skyuxconfig.json`

Call `provideSkyux()` without arguments -- configuration is read automatically from `skyuxconfig.json`.

### App shell component

Wrap the app template in `<skyux-app-shell>` to render the omnibar, help widget, and other shell features:

```html
<skyux-app-shell>
  <router-outlet />
</skyux-app-shell>
```

No additional Angular module imports are needed for the shell -- just the configuration in `skyuxconfig.json`.

### Auth interceptor

The SkyAuth interceptor only attaches the bearer token when a request includes the `sky_auth=true` HttpParams flag. When using generated service clients (from `@blackbaud-internal/skyux-builder-swagger-gen`), auth is handled automatically via `skyAuthHttpOptions()` in the generated `request-builder.ts`.

For manual HTTP calls that need auth:

```typescript
this.#http.get('/api/resource', { params: { sky_auth: 'true' } });
```

## SKY UX packages -- version consistency

All `@skyux/*` packages must be installed at the **same exact version** as `@skyux/core`. Version mismatches cause compilation errors and runtime issues.

**Workflow:**
1. Check current version: `npm list @skyux/core` (e.g., shows 14.2.0)
2. Install with matching version: `npm install @skyux/lists@14.2.0 @skyux/pages@14.2.0`
3. Verify no conflicts: `npm list @skyux/core` -- should show no `invalid` entries

Never run `npm install @skyux/package-name` without specifying the version.

## Angular conventions

These are the standard Angular patterns for Blackbaud SPAs. Some repos may have additional or stricter rules in their own CLAUDE.md or copilot-instructions.md.

- **Standalone components** -- all components are standalone (do not set `standalone: true` in decorators; it is the default)
- **Component prefix** -- `app-` (kebab-case); directive prefix: `app` (camelCase)
- **Control flow** -- use Angular control flow (`@if`, `@for`, `@switch`), not structural directives (`*ngIf`, `*ngFor`)
- **Reactive forms** -- use `ReactiveFormsModule`, `NonNullableFormBuilder`. Do not use `FormsModule` or `ngModel`.
- **Signals** -- use `input()`, `output()`, `computed()` for component state. Use `inject()` instead of constructor injection.
- **Change detection** -- set `changeDetection: ChangeDetectionStrategy.OnPush`
- **Strict TypeScript** -- `@typescript-eslint/no-explicit-any: "error"` is common. No `any` types.
- **Subscription cleanup** -- use `DestroyRef` + `takeUntilDestroyed()`, not `Subject` + `takeUntil` + `ngOnDestroy`

## Styling

Blackbaud SPAs use the SKY UX theme CSS exclusively:

```
@skyux/theme/css/sky.css
@skyux/theme/css/themes/modern/styles.css
```

Do not add custom global stylesheets, design-token overrides, or component SCSS unless no SKY UX component covers the case. Lay out screens with SKY UX components (`sky-page`, `sky-box`, `sky-fluid-grid`, etc.) and rely on the theme for colours, spacing, and typography.

Do not add custom styles to standard HTML elements (`h1`-`h6`, `p`, `button`, etc.) -- SKY UX provides defaults. Prefer SKY UX predefined CSS classes for spacing over hardcoded values.

## Testing

### Standard providers

```typescript
await TestBed.configureTestingModule({
  imports: [ComponentUnderTest],
  providers: [
    provideSkyuxTesting(),    // from '@blackbaud-internal/skyux-shell/testing'
    provideHttpClient(),
    provideHttpClientTesting(),
  ],
});
```

`provideSkyuxTesting()` includes noop animations -- do not add `provideAnimations()` separately.

### Required dev dependencies

- `@skyux-sdk/testing` -- must match the version of `@skyux/core`
- `axe-core@~4.11.1` -- transitive dependency of `@skyux-sdk/testing`

### SKY UX test harnesses

Tests must use SKY UX test harnesses for all SKY UX components. Never query SKY UX components via DOM selectors:

```typescript
// Do this
const tabset = await loader.getHarness(SkyTabsetHarness);

// Never this
const tabset = fixture.querySelector('sky-tabset');           // DOM query
const tab = fixture.debugElement.query(By.css('sky-tab'));     // By.css
expect(el.getAttribute('ng-reflect-heading')).toBe('...');     // ng-reflect
```

For modals, toasts, and popovers: open via the real service from a `TestHostComponent` launcher and load harnesses with `TestbedHarnessEnvironment.documentRootLoader(host)` -- overlay content lives in `document.body`, not the component's DOM.

### WCAG compliance

WCAG 2.2 A/AA compliance is required. Prefer SKY UX components (which carry built-in accessibility) over raw HTML. Use semantic HTML and proper ARIA attributes where custom HTML is necessary.

## Swagger code generation (service clients)

`@blackbaud-internal/skyux-builder-swagger-gen` generates typed Angular service clients from backend OpenAPI specs.

**Version note:** v4+ renamed the CLI command from `swagger-gen` to `generate`:

```shell
# v4+ (current)
skyux-swagger-gen generate <serviceKey>

# v3 (legacy) -- do not use with v4+
skyux-swagger-gen swagger-gen <serviceKey>
```

Configure service clients in `sky-swagger.config.json` with the OpenAPI spec URL. The actual spec lives on the service host (`https://{scs}-{stack}.app.blackbaud.net/{service}/swagger/{auth}/swagger.json`), not the ES Swagger UI URL (which serves HTML).

**Gotcha:** regenerating against a local backend bakes `localhost` into `ApiConfiguration.rootUrl`. Restore the production URL before committing.

## Anti-patterns

Do not:
- Query SKY UX components via DOM selectors (`querySelector('sky-*')`, `By.css('sky-*')`) or `ng-reflect-*` attributes. Use test harnesses.
- Install `@skyux/*` packages without matching the version of `@skyux/core`.
- Add custom CSS when a SKY UX component or utility covers the case.
- Use `ngModel`, `FormsModule`, or template-driven forms. Use reactive forms.
- Use structural directives (`*ngIf`, `*ngFor`). Use Angular control flow (`@if`, `@for`).
- Wrap content in `<sky-wait>...</sky-wait>` -- it has no `<ng-content>`. Place `<sky-wait>` as a sibling inside the parent element.
- Use `provideSkyux()` with arguments. Configuration is read from `skyuxconfig.json` automatically.

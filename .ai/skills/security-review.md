# Security Review

Security-focused code review standards for backend services and single-page applications.

Adapted from the [`security-review`](https://github.com/engineeringsystem/ai-registry/tree/main/skills/security-review) skill in the AI Registry.

## Scope

Review these for security impact:

- Backend services (APIs, microservices, background workers)
- Single-page applications (SPAs)
- Configuration files (authentication, cryptography, security headers)

Do not review cosmetic refactors, style, or performance unless they have a direct security impact.

## OWASP Top 10 2025

Map findings to the current OWASP Top 10 2025 categories:

| ID | Category |
|----|----------|
| A01:2025 | Broken Access Control |
| A02:2025 | Security Misconfiguration |
| A03:2025 | Software Supply Chain Failures |
| A04:2025 | Cryptographic Failures |
| A05:2025 | Injection |
| A06:2025 | Insecure Design |
| A07:2025 | Authentication Failures |
| A08:2025 | Software or Data Integrity Failures |
| A09:2025 | Security Logging and Alerting Failures |
| A10:2025 | Mishandling of Exceptional Conditions |

## Review checklist

### Secrets detection

- Search configuration, settings, environment, and infrastructure files for non-empty credential values (API keys, tokens, passwords, private keys)
- Committed cryptographic keys or secrets are automatically Critical severity
- Evidence required -- do not report "none found" without an actual search

### Authentication and authorisation

- Enumerate all reachable endpoints, routes, handlers, or resolvers
- Check for missing authentication, bypassable authentication, missing or inconsistent authorisation, and privilege escalation
- Distinguish client-side enforcement from server-side controls -- client-side only is not a security boundary
- For Blackbaud services: verify correct use of auth attributes (`[SupportalEndpoint]`, `[Authorize]`, `[HasPermission]`) -- see the Auth skill for patterns

### Injection vulnerabilities

Covers SQL, NoSQL, command, LDAP, and template injection:

- Trace untrusted input from entry points to dangerous sinks
- Describe the input source, the sink, and what sanitisation or parameterisation is missing or ineffective

### Sensitive data exposure

- Identify handling of PII, financial data, credentials, or tokens
- Flag logging of sensitive data, unencrypted storage, and transmission without adequate protection

### Security misconfigurations

- TLS/SSL usage and enforcement
- CORS configuration (overly permissive origins, credentials allowed with wildcard)
- Security headers (CSP, HSTS, X-Content-Type-Options)
- Debug endpoints or Swagger/OpenAPI exposed in production
- Unsafe defaults left in place

## NIST Cybersecurity Framework

Evaluate against the NIST CSF core functions, limited to what is observable in the code:

- **Identify** -- asset visibility, trust boundaries, dependency clarity, configuration consistency
- **Protect** -- authentication, authorisation, cryptography, secure defaults, data protection
- **Detect** -- security-relevant logging, auditability, monitoring hooks
- **Respond** -- safe error handling, abuse resistance, failure containment
- **Recover** -- resilience, safe startup behaviour, protection against persistent compromise

This is a code-level assessment. Do not claim organisational compliance, certification, or maturity levels.

## Severity definitions

| Severity | Meaning |
|----------|---------|
| **Critical** | Exploitable without authentication, or committed secrets/keys. Fix immediately. |
| **High** | Exploitable with low-privilege access or enabling lateral movement. Fix before release. |
| **Medium** | Exploitable under specific conditions or requiring chained vulnerabilities. Fix in current cycle. |
| **Low** | Defence-in-depth improvement. Low exploitability but worth hardening. |

Prioritise Critical and High. Report Medium and Low only when they meaningfully increase risk or enable higher-severity exploitation.

## Diff and PR reviews

When the input is a diff or PR rather than a full repository, limit findings strictly to the changed code and its directly observable context. State missing-context limitations explicitly rather than inferring behaviour from code not shown.

## Accuracy

All findings must cite concrete evidence from the code -- file path, line numbers, and the relevant code. Do not fabricate vulnerabilities or assert exploitability without evidence. Label assumptions when context is missing.

# Pokémon Search Fix Design

**Date:** 2026-08-19  
**Status:** Approved

## Problem

The Pokémon search in the Player/NPC team builder returns no results. Root cause: the Vite dev proxy targets port 3000 but the server runs on port 3099, so the Socket.IO connection never establishes and all emits are silently dropped.

A second latent bug exists: the server filter only searches the internal `name` field (e.g. `'nidoranf'`) and not `displayName` (e.g. `'Nidoran-F'`), so certain Pokémon with special characters in their display names would not be found even after the connection is fixed.

## Changes

### 1. `packages/client/vite.config.ts`
Change the Socket.IO proxy target from `http://localhost:3000` to `http://localhost:3099` to match the server's configured port.

### 2. `packages/server/src/socket/handlers/adminHandlers.ts`
In the `data:query` / `pokemon` case:
- Extend the filter to also match `s.displayName.toLowerCase().includes(query.toLowerCase())`
- Wrap the entire `data:query` block in a `try/catch` that logs the error server-side, so failures surface in the server terminal instead of being silently swallowed

## Out of Scope
- Making the port a shared environment variable (deferred, Option C)
- Adding a connection-status indicator to the admin UI
- Rate-limiting or debouncing search requests

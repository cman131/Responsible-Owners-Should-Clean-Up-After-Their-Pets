# Tech Debt: RegistryPanel UX Improvements (Search + Delete Confirmation)

## State

Complete

Two small UX improvements to `RegistryPanel` that can be implemented in the same pass.

---

## 1 — No Search or Filter in RegistryPanel List

### Summary

The NPC and Player list in `RegistryPanel` has no text filter or search. With more than a handful of saved profiles, finding a specific entry requires manually scrolling through the entire list.

### Location

- `packages/client/src/admin/RegistryPanel.tsx`

### Root Cause

The list renders all profiles directly with no filter state:

```tsx
{profiles.map((p) => (
  <div key={p.profileId} onClick={() => setSelected(p)}>
    {p.displayName}
  </div>
))}
```

### Impact

As the number of saved NPCs and players grows, the panel becomes harder to navigate. Finding a specific profile requires visually scanning the full list.

### Suggested Fix

Add a controlled text input above the list that filters by display name:

```tsx
const [filter, setFilter] = useState('');
const visible = profiles.filter((p) =>
  p.displayName.toLowerCase().includes(filter.toLowerCase())
);

<input
  placeholder="Search…"
  value={filter}
  onChange={(e) => setFilter(e.target.value)}
  style={{ ... }}
/>

{visible.map((p) => (
  <div key={p.profileId} onClick={() => setSelected(p)}>
    {p.displayName}
  </div>
))}
```

---

## 2 — Delete NPC/Player Has No Confirmation Dialog

### Summary

The DEL button in `RegistryPanel` immediately and permanently deletes an NPC or player profile (including their saved team) with no confirmation prompt. A single misclick is unrecoverable.

### Location

- `packages/client/src/admin/RegistryPanel.tsx` (DEL button handler)

### Root Cause

The delete handler fires the delete action directly on click:

```tsx
<button onClick={() => onDelete(profile.profileId)}>DEL</button>
```

There is no intermediate confirmation step.

### Impact

A misclick permanently removes a profile and all its team data. There is no undo.

### Suggested Fix

Show a confirmation prompt before deleting. A simple inline approach:

```tsx
const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

// First click: arm
<button onClick={() => setConfirmDelete(profile.profileId)}>DEL</button>

// Confirmation UI (shown when confirmDelete === profile.profileId):
{confirmDelete === profile.profileId && (
  <span>
    Delete {profile.displayName}?{' '}
    <button onClick={() => { onDelete(profile.profileId); setConfirmDelete(null); }}>Yes</button>
    {' '}
    <button onClick={() => setConfirmDelete(null)}>No</button>
  </span>
)}
```

Alternatively use a small modal or `window.confirm` as a quick stopgap.

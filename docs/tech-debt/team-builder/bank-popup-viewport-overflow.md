# Tech Debt: BankTab Popup Menu Overflows Viewport on Right-Edge Items

## State

New

## Summary

The action popup (Edit / Move to Team / Remove) that appears when clicking a bank Pokémon card is absolutely positioned at `left: 90` relative to the card. For cards near the right edge of the viewport, this pushes the popup off-screen, making its buttons inaccessible.

## Location

- `packages/client/src/admin/BankTab.tsx` (line 87)

## Root Cause

```tsx
<div style={{
  position: 'absolute',
  top: 0,
  left: 90,        // always to the right — no viewport awareness
  background: '#1a1a2e',
  border: '1px solid #3498db',
  borderRadius: 5,
  padding: 6,
  width: 130,
  zIndex: 10
}}>
```

The popup always opens to the right of the card. There is no logic to detect when the card is close to the right edge and flip the popup to the left.

## Impact

If the bank has many Pokémon, the last row of cards will be near or at the right edge of the container (which has `flexWrap: 'wrap'`). Clicking those cards produces a popup that is partially or fully outside the visible area. The Edit, Move to Team, and Remove buttons become unreachable without scrolling horizontally (which is typically disabled).

## Suggested Fix

Use a CSS `right`-anchored position when the popup would overflow, or switch to a smart positioning approach. The simplest fix is to conditionally flip the popup direction using a ref to check element position:

```tsx
function BankCard({ pokemon, index, selectedIndex, setSelectedIndex, ... }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [popupLeft, setPopupLeft] = useState(true);

  function handleClick() {
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      setPopupLeft(rect.right + 140 < window.innerWidth);
    }
    setSelectedIndex(index === selectedIndex ? null : index);
  }

  // popup position: left: 90 or right: 90 based on popupLeft
}
```

Alternatively, use a small utility like `@floating-ui/react` for auto-placement if the project adds it, or simply render the popup at a fixed screen position via a portal.

// Reorder is intentionally stubbed in Phase 8 — the cart/checkout plan
// hasn't shipped yet. Render disabled with a hover tooltip so the affordance
// is visible (buyers know reorder will exist) without being misleading.
//
// When checkout ships, swap to a client component that calls reorderAction
// and router.push('/cart') on success.
export function ReorderButton({ orderId }: { orderId: string }) {
  return (
    <button
      type="button"
      disabled
      title="Reorder will be available when checkout ships"
      aria-label={`Reorder items from order ${orderId} (not yet available)`}
      className="border-input hover:bg-secondary inline-flex h-9 cursor-not-allowed items-center gap-2 rounded-md border bg-transparent px-3 text-sm font-medium opacity-50 transition-colors"
    >
      Reorder
    </button>
  );
}

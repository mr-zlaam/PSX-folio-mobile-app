import type { TradeSide } from "@/src/features/trade/trade-orders";

export type TradeMutationEvent =
  | {
      type: "trade-created";
      orderId: string;
      symbol: string;
      side: TradeSide;
      createdAt: string;
    }
  | {
      type: "dividend-created";
      dividendId: string;
      symbol: string;
      createdAt: string;
    }
  | {
      type: "portfolio-reset";
      createdAt: string;
    };

type TradeMutationListener = (event: TradeMutationEvent) => void;

const tradeMutationListeners = new Set<TradeMutationListener>();

export function subscribeToTradeMutations(
  listener: TradeMutationListener
): () => void {
  tradeMutationListeners.add(listener);

  return () => {
    tradeMutationListeners.delete(listener);
  };
}

export function emitTradeMutation(event: TradeMutationEvent): void {
  for (const listener of tradeMutationListeners) {
    try {
      listener(event);
    } catch {
      // Keep other listeners alive even if one handler throws.
    }
  }
}

export function emitDividendMutation(event: {
  dividendId: string;
  symbol: string;
  createdAt: string;
}): void {
  emitTradeMutation({
    type: "dividend-created",
    dividendId: event.dividendId,
    symbol: event.symbol,
    createdAt: event.createdAt,
  });
}

export function emitPortfolioReset(event: { createdAt: string }): void {
  emitTradeMutation({
    type: "portfolio-reset",
    createdAt: event.createdAt,
  });
}

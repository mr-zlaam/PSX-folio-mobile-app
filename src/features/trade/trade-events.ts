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
      type: "trade-deleted";
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
      type: "dividend-deleted";
      dividendId: string;
      symbol: string;
      createdAt: string;
    }
  | {
      type: "deposit-created";
      depositId: string;
      createdAt: string;
    }
  | {
      type: "deposit-deleted";
      depositId: string;
      createdAt: string;
    }
  | {
      type: "bonus-share-created";
      bonusShareId: string;
      symbol: string;
      createdAt: string;
    }
  | {
      type: "bonus-share-deleted";
      bonusShareId: string;
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

export function emitDepositMutation(event: {
  depositId: string;
  createdAt: string;
}): void {
  emitTradeMutation({
    type: "deposit-created",
    depositId: event.depositId,
    createdAt: event.createdAt,
  });
}

export function emitBonusShareMutation(event: {
  bonusShareId: string;
  symbol: string;
  createdAt: string;
}): void {
  emitTradeMutation({
    type: "bonus-share-created",
    bonusShareId: event.bonusShareId,
    symbol: event.symbol,
    createdAt: event.createdAt,
  });
}

export function emitTradeDeletedMutation(event: {
  orderId: string;
  symbol: string;
  side: TradeSide;
  createdAt: string;
}): void {
  emitTradeMutation({
    type: "trade-deleted",
    orderId: event.orderId,
    symbol: event.symbol,
    side: event.side,
    createdAt: event.createdAt,
  });
}

export function emitDividendDeletedMutation(event: {
  dividendId: string;
  symbol: string;
  createdAt: string;
}): void {
  emitTradeMutation({
    type: "dividend-deleted",
    dividendId: event.dividendId,
    symbol: event.symbol,
    createdAt: event.createdAt,
  });
}

export function emitDepositDeletedMutation(event: {
  depositId: string;
  createdAt: string;
}): void {
  emitTradeMutation({
    type: "deposit-deleted",
    depositId: event.depositId,
    createdAt: event.createdAt,
  });
}

export function emitBonusShareDeletedMutation(event: {
  bonusShareId: string;
  symbol: string;
  createdAt: string;
}): void {
  emitTradeMutation({
    type: "bonus-share-deleted",
    bonusShareId: event.bonusShareId,
    symbol: event.symbol,
    createdAt: event.createdAt,
  });
}

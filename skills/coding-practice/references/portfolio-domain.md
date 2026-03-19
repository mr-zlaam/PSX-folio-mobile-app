# Portfolio Domain Reference

## Core Entities

`Trade`
- `id: string`
- `symbol: string` (uppercase)
- `side: "BUY" | "SELL"`
- `quantity: number` (> 0)
- `price: number` (PKR, > 0)
- `fees: number` (PKR, >= 0)
- `tradeDate: string` (ISO date)
- `notes?: string`

`Position`
- `symbol: string`
- `quantity: number`
- `totalCost: number` (PKR)
- `avgCost: number` (PKR)

`Quote`
- `symbol: string`
- `lastPrice: number` (PKR)
- `asOf: string` (ISO datetime)

## Calculation Conventions

- All portfolio math should be deterministic and centralized in pure utility functions.
- Keep PKR values rounded to 2 decimal places at display boundaries.
- Prefer internal numeric stability (avoid repeated display-format round-trips in business logic).

## Baseline Formulas

- `invested = sum(BUY.quantity * BUY.price + BUY.fees)`
- `proceeds = sum(SELL.quantity * SELL.price - SELL.fees)`
- `netQuantity = totalBuyQuantity - totalSellQuantity`
- `marketValue = netQuantity * lastPrice`
- `unrealizedPnL = marketValue - remainingCostBasis`
- `realizedPnL = proceeds - soldCostBasis`
- `totalPnL = realizedPnL + unrealizedPnL`
- `returnPct = invested > 0 ? (totalPnL / invested) * 100 : 0`

## Validation Rules

- Reject sells that exceed current owned quantity.
- Reject zero or negative quantity/price values.
- Fees must be non-negative.
- Symbol should be trimmed and uppercased before persistence.
- All date handling should respect `Asia/Karachi` for user-facing views.

## Future Extensions

- Corporate actions (split/bonus/right shares).
- Dividend income tracking.
- Multiple portfolios and account-level aggregation.

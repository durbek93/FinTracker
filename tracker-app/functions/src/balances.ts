export interface DBAccount {
  id: string;
  name: string;
  currency?: "UZS" | "USD";
  excludeFromTotal?: boolean;
  balanceUZS: number;
  balanceUSD: number;
}

export interface DBTransaction {
  id: string;
  amount: number;
  currency: "UZS" | "USD";
  accountId: string;
  toAccountId?: string;
  convertedAmount?: number;
  type: "income" | "expense" | "transfer";
  categoryId?: string;
}

export function calculateBalances(accounts: DBAccount[], transactions: DBTransaction[]): DBAccount[] {
  const result = accounts.map((acc) => ({
    ...acc,
    balanceUZS: Number(acc.balanceUZS) || 0,
    balanceUSD: Number(acc.balanceUSD) || 0
  }));

  transactions.forEach((t) => {
    if (t.type === "transfer") {
      const fromAcc = result.find((a) => a.id === t.accountId);
      const toAcc = result.find((a) => a.id === t.toAccountId);

      if (fromAcc) {
        if (t.currency === "UZS") fromAcc.balanceUZS -= t.amount;
        else fromAcc.balanceUSD -= t.amount;
      }
      if (toAcc) {
        const receivedAmt = t.convertedAmount || t.amount;
        const toCurrency = toAcc.currency || "UZS";
        if (toCurrency === "UZS") toAcc.balanceUZS += receivedAmt;
        else toAcc.balanceUSD += receivedAmt;
      }
    } else {
      const acc = result.find((a) => a.id === t.accountId);
      if (!acc) return;

      const amount = t.type === "income" ? t.amount : -t.amount;

      if (t.currency === "UZS") {
        acc.balanceUZS += amount;
      } else {
        acc.balanceUSD += amount;
      }
    }
  });

  return result;
}

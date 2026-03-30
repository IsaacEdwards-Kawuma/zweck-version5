import { useQuery } from "@tanstack/react-query";
import { balances, directorsAll, summary } from "../api/accounts";
import { invoiceMetrics } from "../api/invoices";
import { listTransactions, txItems } from "../api/transactions";
import { portfolio } from "../api/portfolio";

export function useBalances() {
  return useQuery({ queryKey: ["balances"], queryFn: balances });
}

export function useSummary() {
  return useQuery({ queryKey: ["summary"], queryFn: summary });
}

export function useDirectorsAll() {
  return useQuery({ queryKey: ["directors_all"], queryFn: directorsAll });
}

export function usePortfolio() {
  return useQuery({ queryKey: ["portfolio"], queryFn: portfolio });
}

export function useInvoiceMetrics() {
  return useQuery({
    queryKey: ["invoice_metrics"],
    queryFn: invoiceMetrics,
    staleTime: 60_000
  });
}

/** Single fetch for dashboard analytics + recent activity (avoids duplicate /transactions calls). */
export function useTransactionsList() {
  return useQuery({
    queryKey: ["transactions", "dashboard"],
    queryFn: async () => {
      const res = await listTransactions({ limit: 100000, offset: 0 });
      return txItems(res);
    }
  });
}

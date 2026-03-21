import { useQuery } from "@tanstack/react-query";
import { balances, directorsAll, summary } from "../api/accounts";
import { listTransactions } from "../api/transactions";
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

export function useRecentTransactions() {
  return useQuery({
    queryKey: ["transactions", "recent7"],
    queryFn: async () => {
      const all = await listTransactions();
      return all.slice(0, 7);
    }
  });
}

export function useTransactionsCount() {
  return useQuery({
    queryKey: ["transactions", "count"],
    queryFn: async () => {
      const all = await listTransactions();
      return all.length;
    }
  });
}


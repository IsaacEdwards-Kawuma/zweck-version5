import { useQuery } from "@tanstack/react-query";
import { listTransactions } from "../api/transactions";

export function useTransactions(filters) {
  return useQuery({
    queryKey: ["transactions", filters ?? {}],
    queryFn: () => listTransactions(filters),
    keepPreviousData: true
  });
}


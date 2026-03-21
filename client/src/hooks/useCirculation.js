import { useQuery } from "@tanstack/react-query";
import { listCirculation } from "../api/circulation";

export function useCirculation() {
  return useQuery({ queryKey: ["circulation"], queryFn: listCirculation });
}


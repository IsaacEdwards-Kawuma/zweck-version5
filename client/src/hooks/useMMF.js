import { useQuery } from "@tanstack/react-query";
import { listMMF } from "../api/mmf";

export function useMMF() {
  return useQuery({ queryKey: ["mmf"], queryFn: listMMF });
}


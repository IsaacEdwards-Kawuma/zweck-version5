import { useQuery } from "@tanstack/react-query";
import { me } from "../api/auth";

export function useMe(enabled = true) {
  return useQuery({
    queryKey: ["me"],
    queryFn: me,
    enabled
  });
}


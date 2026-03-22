import { useQuery } from "@tanstack/react-query";
import { listMMF } from "../api/mmf";

/** @param {number | "" | undefined} projectId - filter MMF entries linked to this project */
export function useMMF(projectId) {
  return useQuery({
    queryKey: ["mmf", projectId ?? "all"],
    queryFn: () => listMMF(projectId === "" ? undefined : projectId)
  });
}


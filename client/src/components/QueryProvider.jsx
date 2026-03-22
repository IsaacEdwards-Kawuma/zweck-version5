import { useEffect, useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { notifyMutationError, registerMutationErrorToast } from "../lib/mutationErrorBridge";
import { useToast } from "./Toast";

export default function QueryProvider({ children }) {
  const toast = useToast();

  useEffect(() => {
    registerMutationErrorToast(toast.error);
    return () => registerMutationErrorToast(() => {});
  }, [toast.error]);

  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: true
          },
          mutations: {
            onError: notifyMutationError
          }
        }
      }),
    []
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

import { getApiErrorMessage } from "./errors";

let showMutationError = () => {};

/** Called from ToastProvider (or QueryProvider) once a toast API is available. */
export function registerMutationErrorToast(fn) {
  showMutationError = fn;
}

export function notifyMutationError(err) {
  showMutationError(getApiErrorMessage(err));
}

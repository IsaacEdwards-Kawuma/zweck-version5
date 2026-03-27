/**
 * Transaction types — server only supports `CONTRIBUTION` (director capital).
 */

export const TX_TYPE_GROUPS = [
  {
    label: "Capital",
    options: [{ value: "CONTRIBUTION", label: "Director Capital Contribution" }]
  }
];

export const TX_TYPE_LABELS = Object.fromEntries(
  TX_TYPE_GROUPS.flatMap((g) => g.options.map((o) => [o.value, o.label]))
);

export function labelForTxType(type) {
  if (type == null || type === "") return "UNKNOWN";
  return TX_TYPE_LABELS[type] || String(type).replaceAll("_", " ");
}

export const TX_ACCOUNT_MAP = {
  CONTRIBUTION: { debit: "bank", credit: "capital", needsDirector: true }
};

export const TX_POSTING_CATEGORY = {
  CONTRIBUTION: "OTHER"
};

export const POSTING_BUCKET_OPTIONS = [{ value: "ALL", label: "Contributions" }];

export function filterTxTypeGroupsForBucket() {
  return TX_TYPE_GROUPS;
}

export function firstTxTypeInBucket() {
  return "CONTRIBUTION";
}

/** Ledger / statement filters: bank by currency + aggregate capital. */
export const LEDGER_ACCOUNT_FILTER_OPTIONS = [
  { value: "bank_ugx", label: "1200 Cash at Bank (UGX)" },
  { value: "bank_usd", label: "1210 Cash at Bank (USD)" },
  { value: "bank_eur", label: "1220 Cash at Bank (EUR)" },
  { value: "capital", label: "Director capital (all directors)" }
];

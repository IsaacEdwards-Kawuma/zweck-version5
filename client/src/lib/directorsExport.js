export function downloadDirectorsCsv(directors, filename = "zweck-directors.csv") {
  const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const headers = ["name", "email", "initials", "joined_round", "active", "capital_eur", "side_fund_eur", "total_eur"];
  const lines = [headers.join(",")];
  for (const d of directors) {
    lines.push(
      [
        d.name,
        d.email,
        d.initials,
        d.joinedRound ?? "",
        d.active ? "yes" : "no",
        d.capital ?? 0,
        d.sideFund ?? 0,
        d.total ?? 0
      ]
        .map(esc)
        .join(",")
    );
  }
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

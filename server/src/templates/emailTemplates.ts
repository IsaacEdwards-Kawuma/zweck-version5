const baseLayout = (title: string, bodyHtml: string) => `
  <div style="font-family: Arial, Helvetica, sans-serif; color: #1f2937; line-height: 1.5; max-width: 640px; margin: 0 auto;">
    <div style="padding: 16px 20px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
      <h2 style="margin: 0 0 12px; color: #2563eb;">${title}</h2>
      ${bodyHtml}
      <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0 12px;" />
      <p style="margin: 0; font-size: 12px; color: #6b7280;">Zweck automated notification</p>
    </div>
  </div>
`;

export const welcomeEmail = (name: string) =>
  baseLayout(
    `Welcome to Zweck${name ? `, ${escapeHtml(name)}` : ""}`,
    `
      <p>Your account has been created successfully.</p>
      <p>You can now manage transactions, projects, and reports securely.</p>
    `
  );

export const passwordResetEmail = (link: string) =>
  baseLayout(
    "Password Reset Request",
    `
      <p>Use the link below to reset your password:</p>
      <p><a href="${escapeAttr(link)}" style="color:#2563eb;">Reset Password</a></p>
      <p>If you did not request this, you can ignore this email.</p>
    `
  );

export const transactionPostedEmail = (referenceNumber: string, amount: number, currency = "EUR") =>
  baseLayout(
    "Transaction Posted",
    `
      <p>Reference: <strong>${escapeHtml(referenceNumber)}</strong></p>
      <p>Amount: <strong>${Number(amount).toLocaleString()} ${escapeHtml(currency)}</strong></p>
      <p>Status: <strong>POSTED</strong></p>
    `
  );

export const transactionReversalEmail = (referenceNumber: string) =>
  baseLayout(
    "Transaction Reversed",
    `
      <p>Reference: <strong>${escapeHtml(referenceNumber)}</strong></p>
      <p>This transaction has been reversed for audit compliance. Original and reversal entries remain visible in the ledger.</p>
    `
  );

export const reportReadyEmail = (link: string) =>
  baseLayout(
    "Your Report Is Ready",
    `
      <p>Your requested report is available.</p>
      <p><a href="${escapeAttr(link)}" style="color:#2563eb;">Open Reports</a></p>
    `
  );

export const notificationEmail = (message: string) =>
  baseLayout(
    "New Notification",
    `
      <p>${escapeHtml(message)}</p>
    `
  );

export const meetingReminderEmail = (title: string, date: string, time: string | null, location: string | null, meetingsUrl: string) =>
  baseLayout(
    `Reminder: ${escapeHtml(title)}`,
    `
      <p><strong>When:</strong> ${escapeHtml([date, time].filter(Boolean).join(" · "))}</p>
      ${location ? `<p><strong>Location:</strong> ${escapeHtml(location)}</p>` : ""}
      <p><a href="${escapeAttr(meetingsUrl)}" style="color:#2563eb;">Open Meetings</a></p>
    `
  );

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string): string {
  return String(value).replace(/"/g, "&quot;");
}


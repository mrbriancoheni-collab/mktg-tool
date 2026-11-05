// Transactional email. Uses Resend when RESEND_API_KEY is set; otherwise the
// message is logged to the console (development) so links can be copied.

export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`\n[email:dev] To: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "AdCanvas <no-reply@example.com>", to, subject, text }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    console.error(`[email] send failed ${res.status}: ${await res.text().catch(() => "")}`);
    return false;
  }
  return true;
}

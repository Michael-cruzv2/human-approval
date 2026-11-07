import "server-only";

import { getAppConfig } from "@/lib/server/config";

export interface OtpEmailSender {
  sendLoginCode(recipient: string, code: string): Promise<boolean>;
}

export class MailgunOtpEmailSender implements OtpEmailSender {
  async sendLoginCode(recipient: string, code: string): Promise<boolean> {
    const { MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_REGION, EMAIL_FROM } = getAppConfig().env;
    const apiHost = MAILGUN_REGION === "EU" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net";
    const form = new FormData();
    form.set("from", EMAIL_FROM);
    form.set("to", recipient);
    form.set("subject", "Your Lead Review sign-in code");
    form.set(
      "text",
      `Your sign-in code is ${code}.\n\nIt expires in 10 minutes.\n\nIgnore this email if you did not request this.`,
    );

    try {
      const response = await fetch(
        `${apiHost}/v3/${encodeURIComponent(MAILGUN_DOMAIN)}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`api:${MAILGUN_API_KEY}`).toString("base64")}`,
          },
          body: form,
          cache: "no-store",
        },
      );
      if (!response.ok) {
        console.error("OTP email provider rejected the send", {
          provider: "mailgun",
          statusCode: response.status,
        });
        return false;
      }
      return true;
    } catch {
      console.error("OTP email provider request failed", { provider: "mailgun" });
      return false;
    }
  }
}

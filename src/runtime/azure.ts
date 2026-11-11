/** Azure transport adjustments for the pinned Pi SDK; no alternate model client. */
export function azureErrorMessage(value: unknown): string {
  const text = typeof value === "string" ? value : "";
  const status = /\b(401|403|404|429)\b/.exec(text)?.[1];
  switch (status) {
    case "401": return "LAB Azure 401: authentication rejected. Check the selected auth mode, key/header, or Entra token audience and expiry; run lab --configure.";
    case "403": return "LAB Azure 403: access denied. Ask the landing-zone owner to check RBAC, gateway policy, network allowlist and deployment access.";
    case "404": return "LAB Azure 404: route or deployment not found. Check the API base path, exact Azure deployment name and API version with the landing-zone owner.";
    case "429": return "LAB Azure 429: quota or rate limit reached. Wait before retrying; ask the landing-zone owner about deployment capacity and gateway limits.";
    default: return "LAB Azure request failed. Check endpoint, proxy, corporate CA and auth configuration; see docs/azure-openai.md.";
  }
}
type AssistantMessage = { role: string; provider?: string; stopReason?: string; errorMessage?: string };
type AzureAPI = {
  on(name: "before_provider_headers", handler: (event: { headers: Record<string, string | null> }, ctx: { model?: { provider: string } }) => void): void;
  on(name: "message_end", handler: (event: { message: AssistantMessage }) => { message: AssistantMessage } | undefined): void;
};
export default function azureTransport(pi: AzureAPI): void {
  pi.on("before_provider_headers", (event, ctx) => {
    if (ctx.model?.provider === "azure" && ["custom-header", "bearer-command"].includes(process.env.LAB_AZURE_AUTH_MODE ?? "")) {
      // OpenAI's SDK accepts null as an explicit omission. Empty strings fail its
      // auth validator for gateways with a custom subscription header.
      event.headers["api-key"] = null;
    }
  });
  pi.on("message_end", ({ message }) => {
    if (message.role === "assistant" && message.provider === "azure" && message.stopReason === "error") return { message: { ...message, errorMessage: azureErrorMessage(message.errorMessage) } };
  });
}

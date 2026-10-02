import { hasCloudflareCredentials, isNodeRuntime } from "@/lib/runtime";
import { getOutboundEmailProvider, isOutboundEmailConfigured } from "@/lib/email/outbound-provider";
import type { SetupRequirementCheck } from "./types";

export function getSetupRequirementChecks(env: CloudflareEnv): SetupRequirementCheck[] {
	const hasApiToken = !!env.CF_TOKEN?.trim();
	const hasGlobalKey = !!env.CF_API_KEY?.trim() && !!env.CF_EMAIL?.trim();

	if (isNodeRuntime(env)) {
		return [
			{
				key: "Database",
				configured: !!env.DB,
				message: "DATA_DIR must be writable; the SQLite database is created there on start.",
			},
			{
				key: "Outbound mail",
				configured: isOutboundEmailConfigured(env),
				message: getOutboundEmailProvider(env) === "resend"
					? "Set RESEND_API_KEY to send through Resend. Receiving works without it."
					: "Set SMTP_URL, or CF_ACCOUNT_ID with CF_TOKEN to send through Cloudflare. Receiving works without it.",
			},
			{
				key: "Cloudflare API credentials (optional)",
				configured: true,
				message: hasCloudflareCredentials(env)
					? "Domains are provisioned on Cloudflare automatically."
					: "Not set: add MX and SPF records for each domain by hand, as shown on the domain page.",
			},
		];
	}

	return [
		{
			key: "Outbound mail",
			configured: isOutboundEmailConfigured(env),
			message: getOutboundEmailProvider(env) === "resend"
				? "Set RESEND_API_KEY as a Worker secret to send through Resend."
				: "Uses the Cloudflare EMAIL binding. Configure Email Sending for the domain to deliver outbound mail.",
		},
		{
			key: "Cloudflare API credentials",
			configured: hasApiToken || hasGlobalKey,
			message: "Set CF_TOKEN, or set both CF_API_KEY and CF_EMAIL.",
		},
		{
			key: "D1 database",
			configured: !!env.DB,
			message: "Deploy the Worker with the DB binding from wrangler.jsonc.",
		},
	];
}

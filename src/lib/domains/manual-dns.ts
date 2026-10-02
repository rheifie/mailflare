import type { DomainDnsView } from "@/lib/domains/service";
import { isOutboundEmailConfigured } from "@/lib/email/outbound-provider";

/**
 * The DNS a self-hosted install needs when Mailflare is not managing the
 * zone. Rendered as "missing" until the operator confirms, since the app
 * cannot read their DNS; the records are what the SMTP listener and an
 * SMTP relay expect.
 */
export async function getManualDomainDns(env: CloudflareEnv, hostname: string): Promise<DomainDnsView> {
	const mailHost = process.env.MAIL_HOSTNAME?.trim() || `mail.${hostname}`;
	const records = [
		{ type: "MX", name: hostname, content: `10 ${mailHost}`, ttl: 3600 },
		{ type: "TXT", name: hostname, content: `v=spf1 a:${mailHost} ~all`, ttl: 3600 },
		{ type: "TXT", name: `_dmarc.${hostname}`, content: "v=DMARC1; p=none", ttl: 3600 },
	];
	return {
		routing: { records: [], missing: records, status: "manual" },
		sending: [],
		sendingEnabled: isOutboundEmailConfigured(env),
	};
}

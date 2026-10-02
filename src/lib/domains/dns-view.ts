import { summariseDns, type DnsStatusSummary } from "@/lib/dns-status";
import { auditDomainDns, type DomainDnsAudit } from "@/lib/domains/dns-audit";
import { getDomainDns, type DomainDnsView } from "@/lib/domains/service";
import type { DomainRow } from "@/lib/domains/types";
import { getOutboundEmailProvider, isOutboundEmailConfigured } from "@/lib/email/outbound-provider";

export type DomainDnsViewWithAudit = DomainDnsView & {
	audit?: DomainDnsAudit;
	outboundEmailProvider: "cloudflare" | "resend";
	outboundEmailConfigured: boolean;
};

/** The DNS page's view: zone records plus an independent public-DNS audit. */
export async function getDomainDnsView(
	env: CloudflareEnv,
	domain: DomainRow,
): Promise<DomainDnsViewWithAudit> {
	const dns = await getDomainDns(env, domain);
	const outboundEmailProvider = getOutboundEmailProvider(env);
	const audit = outboundEmailProvider === "cloudflare" ? await auditDomainDns(domain.hostname, dns) : undefined;
	return {
		...dns,
		audit,
		outboundEmailProvider,
		outboundEmailConfigured: isOutboundEmailConfigured(env),
	};
}

/** The compact per-domain status the list endpoint returns. */
export async function summariseDomainDns(
	env: CloudflareEnv,
	domain: DomainRow,
): Promise<{ summary: DnsStatusSummary; sendingEnabled: boolean }> {
	const view = await getDomainDns(env, domain);
	const outboundEmailProvider = getOutboundEmailProvider(env);
	const audit = outboundEmailProvider === "cloudflare" ? await auditDomainDns(domain.hostname, view) : undefined;
	const sendingEnabled = outboundEmailProvider === "resend" ? isOutboundEmailConfigured(env) : view.sendingEnabled;
	return {
		summary: summariseDns(
			view.routing.records,
			view.routing.missing,
			view.sending,
			domain.routingEnabled,
			sendingEnabled,
			audit,
		),
		sendingEnabled,
	};
}

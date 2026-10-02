export type DomainListResult = {
	domains?: { id: string; hostname: string }[];
	outboundEmailProvider?: "cloudflare" | "resend";
};

export type DomainCreateResult = {
	domain?: { id: string };
	error?: string;
	code?: "MX_RECORDS_CONFLICT";
};

export type DomainPreflight = {
	hostname: string;
	zone: { id: string; name: string };
};

export type DomainPreflightResponse = {
	ok: boolean;
	domain?: DomainPreflight;
	error?: string;
};

export type MailboxCreateResult = {
	error?: string;
};

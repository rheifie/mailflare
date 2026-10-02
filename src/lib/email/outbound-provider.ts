import { getEmailAddress } from "@/lib/email/address";
import type { AttachmentContent } from "@/lib/email/attachment-types";
import { isNodeRuntime } from "@/lib/runtime";

export type OutboundEmailProvider = "cloudflare" | "resend";

export type OutboundEmail = {
	from: string;
	to: string[];
	cc?: string[];
	bcc?: string[];
	subject: string;
	text?: string;
	html?: string;
	headers?: Record<string, string>;
	attachments?: AttachmentContent[];
};

export function getOutboundEmailProvider(env: CloudflareEnv): OutboundEmailProvider {
	const configured = env.OUTBOUND_EMAIL_PROVIDER?.trim().toLowerCase();
	if (!configured || configured === "cloudflare") return "cloudflare";
	if (configured === "resend") return "resend";
	throw new Error("OUTBOUND_EMAIL_PROVIDER must be either cloudflare or resend");
}

export function isOutboundEmailConfigured(env: CloudflareEnv): boolean {
	if (getOutboundEmailProvider(env) === "resend") return !!env.RESEND_API_KEY?.trim();
	if (isNodeRuntime(env)) {
		const mailer = env.EMAIL as unknown as { configured?: boolean } | undefined;
		return mailer?.configured === true;
	}
	return !!env.EMAIL;
}

/**
 * Sends through the configured outbound provider. Provider errors are never
 * silently failed over: doing so after an ambiguous timeout can deliver the
 * same message twice. Resend requests use the outbound job id as an
 * idempotency key; Resend deduplicates matching requests for 24 hours.
 */
export async function sendOutboundEmail(
	env: CloudflareEnv,
	message: OutboundEmail,
	options: { idempotencyKey?: string; rfcMessageId?: string } = {},
): Promise<{ messageId: string }> {
	const provider = getOutboundEmailProvider(env);
	if (provider === "cloudflare") {
		const response = await env.EMAIL.send({
			from: message.from,
			to: message.to,
			...(message.cc?.length ? { cc: message.cc } : {}),
			...(message.bcc?.length ? { bcc: message.bcc } : {}),
			subject: message.subject,
			headers: message.headers && Object.keys(message.headers).length ? message.headers : undefined,
			html: message.html,
			text: message.text,
			attachments: (message.attachments ?? []).map((attachment) =>
				attachment.disposition === "inline" && attachment.contentId
					? {
							filename: attachment.filename,
							type: attachment.type,
							content: attachment.content,
							disposition: "inline" as const,
							contentId: attachment.contentId,
						}
					: {
							filename: attachment.filename,
							type: attachment.type,
							content: attachment.content,
							disposition: "attachment" as const,
						},
			),
		});
		return { messageId: response.messageId };
	}

	const apiKey = env.RESEND_API_KEY?.trim();
	if (!apiKey) throw new Error("RESEND_API_KEY is required when OUTBOUND_EMAIL_PROVIDER=resend");

	const messageId = options.rfcMessageId ?? createRfcMessageId(message.from);
	const headers = Object.fromEntries(
		Object.entries(message.headers ?? {}).filter(([name]) => name.toLowerCase() !== "message-id"),
	);
	headers["Message-ID"] = messageId;

	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
		},
		signal: AbortSignal.timeout(15_000),
		body: JSON.stringify({
			from: message.from,
			to: message.to,
			...(message.cc?.length ? { cc: message.cc } : {}),
			...(message.bcc?.length ? { bcc: message.bcc } : {}),
			subject: message.subject,
			...(message.text !== undefined ? { text: message.text } : {}),
			...(message.html !== undefined ? { html: message.html } : {}),
			headers,
			...(message.attachments?.length
				? {
						attachments: message.attachments.map((attachment) => ({
							filename: attachment.filename,
							content: arrayBufferToBase64(attachment.content),
							content_type: attachment.type,
							...(attachment.disposition === "inline" && attachment.contentId
								? { content_id: attachment.contentId }
								: {}),
						})),
					}
				: {}),
		}),
	});

	if (!response.ok) {
		const detail = await response.text().catch(() => "");
		throw new Error(`Resend email delivery failed (${response.status}): ${detail.slice(0, 300)}`);
	}

	const result: unknown = await response.json().catch(() => null);
	if (!result || typeof result !== "object" || typeof (result as { id?: unknown }).id !== "string") {
		throw new Error("Resend accepted the request but returned an invalid response");
	}
	return { messageId };
}

export function createRfcMessageId(from: string, localId = crypto.randomUUID()): string {
	const address = getEmailAddress(from).trim();
	const at = address.lastIndexOf("@");
	const domain = at >= 0 ? address.slice(at + 1).toLowerCase() : "mailflare.invalid";
	return `<${localId}@${domain}>`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	const chunkSize = 0x8000;
	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
	}
	return btoa(binary);
}

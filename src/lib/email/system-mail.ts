import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { domains, mailboxes, users } from "@/db/schema";
import { formatEmailAddress } from "@/lib/email/address";
import type { SystemMailInput } from "@/lib/email/system-mail-types";
import { getOutboundEmailProvider, isOutboundEmailConfigured, sendOutboundEmail } from "@/lib/email/outbound-provider";

/**
 * Mail the application sends on its own behalf (password resets). It goes
 * straight through the send binding: no Sent copy, no contact upsert, no
 * webhooks, and the auto-generated headers mail systems expect.
 *
 * The From address is the primary mailbox of the first administrator on a
 * domain that can send through the selected provider. If no sender is
 * available, the caller decides what to tell the user.
 */
export async function sendSystemEmail(env: CloudflareEnv, input: SystemMailInput): Promise<boolean> {
	const provider = getOutboundEmailProvider(env);
	if (!isOutboundEmailConfigured(env)) return false;
	const sender = await pickSystemSender(env, provider);
	if (!sender) return false;

	await sendOutboundEmail(env, {
		from: formatEmailAddress(sender.address, sender.name),
		to: [input.to],
		subject: input.subject,
		text: input.text,
		html: input.html,
		headers: {
			"Auto-Submitted": "auto-generated",
			"X-Auto-Response-Suppress": "All",
		},
	});
	return true;
}

export async function pickSystemSender(
	env: CloudflareEnv,
	provider = getOutboundEmailProvider(env),
): Promise<{ address: string; name: string } | null> {
	const db = getDb(env);
	const conditions = [eq(mailboxes.disabled, false), eq(users.disabled, false)];
	if (provider === "cloudflare") conditions.push(eq(domains.sendingEnabled, true));
	const rows = await db
		.select({
			localPart: mailboxes.localPart,
			displayName: mailboxes.displayName,
			hostname: domains.hostname,
			role: users.role,
		})
		.from(mailboxes)
		.innerJoin(domains, eq(mailboxes.domainId, domains.id))
		.innerJoin(users, eq(mailboxes.userId, users.id))
		.where(and(...conditions))
		.orderBy(asc(mailboxes.createdAt))
		.limit(50);
	const chosen = rows.find((row) => row.role === "admin") ?? rows[0];
	if (!chosen) return null;
	return { address: `${chosen.localPart}@${chosen.hostname}`, name: chosen.displayName ?? "Mailflare" };
}

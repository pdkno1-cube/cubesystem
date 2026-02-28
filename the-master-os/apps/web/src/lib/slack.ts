import * as Sentry from "@sentry/nextjs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SlackBlockText {
  type: "plain_text" | "mrkdwn";
  text: string;
}

interface SlackBlockElement {
  type: string;
  text: string;
  url?: string;
}

interface SlackBlock {
  type: string;
  text?: SlackBlockText;
  elements?: SlackBlockElement[];
  fields?: SlackBlockText[];
}

interface SlackMessage {
  channel?: string;
  text: string;
  blocks?: SlackBlock[];
}

type Severity = "info" | "warning" | "critical";

interface AlertParams {
  title: string;
  message: string;
  severity: Severity;
  channel?: string;
  link?: string;
}

interface SlackApiResponse {
  ok: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SLACK_BOT_TOKEN = process.env["SLACK_BOT_TOKEN"] ?? "";
const SLACK_WEBHOOK_URL = process.env["SLACK_WEBHOOK_URL"] ?? "";
const DEFAULT_CHANNEL = process.env["SLACK_DEFAULT_CHANNEL"] ?? "#alerts";

const SEVERITY_EMOJI: Record<Severity, string> = {
  info: "\ud83d\udfe2",
  warning: "\ud83d\udfe1",
  critical: "\ud83d\udd34",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  info: "Info",
  warning: "Warning",
  critical: "Critical",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns `true` when at least one Slack delivery method is configured.
 * Use this to decide whether to attempt sending messages.
 */
export function isSlackConfigured(): boolean {
  return !!(SLACK_BOT_TOKEN || SLACK_WEBHOOK_URL);
}

// ---------------------------------------------------------------------------
// Core send — Bot Token (preferred) or Webhook fallback
// ---------------------------------------------------------------------------

/**
 * Sends a message to Slack.
 *
 * Delivery priority:
 *  1. Bot Token  (POST https://slack.com/api/chat.postMessage)
 *  2. Webhook    (POST to SLACK_WEBHOOK_URL)
 *
 * Returns `true` on success, `false` on failure (errors are reported to Sentry).
 * When neither token nor webhook is configured the function is a no-op that
 * returns `false`.
 */
export async function sendSlackMessage(message: SlackMessage): Promise<boolean> {
  if (!isSlackConfigured()) {
    return false;
  }

  const channel = message.channel ?? DEFAULT_CHANNEL;

  // --- Strategy 1: Bot Token ---
  if (SLACK_BOT_TOKEN) {
    try {
      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          channel,
          text: message.text,
          ...(message.blocks ? { blocks: message.blocks } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      });

      const json = (await res.json()) as SlackApiResponse;

      if (!json.ok) {
        Sentry.captureMessage(`Slack API error: ${json.error ?? "unknown"}`, {
          level: "warning",
          tags: { context: "slack.sendMessage.botToken" },
        });
        return false;
      }

      return true;
    } catch (error) {
      Sentry.captureException(error, {
        tags: { context: "slack.sendMessage.botToken" },
      });
      return false;
    }
  }

  // --- Strategy 2: Webhook ---
  if (SLACK_WEBHOOK_URL) {
    try {
      const res = await fetch(SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: message.text,
          ...(message.blocks ? { blocks: message.blocks } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        Sentry.captureMessage(
          `Slack Webhook returned ${res.status}: ${res.statusText}`,
          {
            level: "warning",
            tags: { context: "slack.sendMessage.webhook" },
          },
        );
        return false;
      }

      return true;
    } catch (error) {
      Sentry.captureException(error, {
        tags: { context: "slack.sendMessage.webhook" },
      });
      return false;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// High-level alert helper
// ---------------------------------------------------------------------------

/**
 * Sends a rich, color-coded alert to Slack.
 *
 * Severity mapping:
 *  - info     -> green circle
 *  - warning  -> yellow circle
 *  - critical -> red circle
 */
export async function sendAlert(params: AlertParams): Promise<boolean> {
  const { title, message, severity, channel, link } = params;

  const emoji = SEVERITY_EMOJI[severity];
  const label = SEVERITY_LABEL[severity];

  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${emoji} *[${label}] ${title}*`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: message,
      },
    },
  ];

  if (link) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: "\ud83d\udd17 View Details",
          url: link,
        },
      ],
    });
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `The Master OS | ${new Date().toISOString()}`,
      },
    ],
  });

  const fallbackText = `${emoji} [${label}] ${title}: ${message}`;

  return sendSlackMessage({
    channel,
    text: fallbackText,
    blocks,
  });
}

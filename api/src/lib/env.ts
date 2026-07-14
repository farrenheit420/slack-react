function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function getAppBaseUrl(): string {
  return (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function getSlackConfig() {
  return {
    clientId: required("SLACK_CLIENT_ID"),
    clientSecret: required("SLACK_CLIENT_SECRET"),
    redirectUri:
      process.env.SLACK_REDIRECT_URI ||
      `${getAppBaseUrl()}/auth/slack/callback`,
  };
}

export function getFreeTierLimit(): number {
  const raw = process.env.FREE_TIER_MONTHLY_LIMIT;
  const n = raw ? Number(raw) : 50;
  return Number.isFinite(n) && n > 0 ? n : 50;
}

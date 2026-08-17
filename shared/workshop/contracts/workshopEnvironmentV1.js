export const WORKSHOP_CLOUDFLARE_BINDINGS_V1 = Object.freeze({
  database: 'WORKSHOP_DB',
  packages: 'WORKSHOP_PACKAGES'
});

export const WORKSHOP_SERVER_ENVIRONMENT_V1 = Object.freeze({
  discordClientId: 'DISCORD_CLIENT_ID',
  discordClientSecret: 'DISCORD_CLIENT_SECRET',
  discordRedirectUri: 'DISCORD_REDIRECT_URI',
  sessionSecret: 'WORKSHOP_SESSION_SECRET',
  adminDiscordIds: 'WORKSHOP_ADMIN_DISCORD_IDS',
  allowedOrigins: 'WORKSHOP_ALLOWED_ORIGINS',
  maxPackageBytes: 'WORKSHOP_MAX_PACKAGE_BYTES',
  dailyRevisionLimit: 'WORKSHOP_DAILY_REVISION_LIMIT',
  maxPublicItems: 'WORKSHOP_MAX_PUBLIC_ITEMS',
  maxUserStorageBytes: 'WORKSHOP_MAX_USER_STORAGE_BYTES',
  maxTotalStorageBytes: 'WORKSHOP_MAX_TOTAL_STORAGE_BYTES',
  uploadEnabled: 'WORKSHOP_UPLOAD_ENABLED',
  turnstileSecretKey: 'TURNSTILE_SECRET_KEY'
});

export const WORKSHOP_CLIENT_ENVIRONMENT_V1 = Object.freeze({
  workshopEnabled: 'VITE_WORKSHOP_ENABLED',
  turnstileSiteKey: 'VITE_TURNSTILE_SITE_KEY'
});

export const WORKSHOP_ENVIRONMENT_DEFAULTS_V1 = Object.freeze({
  maxPackageBytes: 256 * 1024,
  dailyRevisionLimit: 20,
  maxPublicItems: 20,
  maxUserStorageBytes: 10 * 1024 * 1024,
  maxTotalStorageBytes: 4 * 1024 * 1024 * 1024,
  uploadEnabled: false,
  workshopEnabled: false
});

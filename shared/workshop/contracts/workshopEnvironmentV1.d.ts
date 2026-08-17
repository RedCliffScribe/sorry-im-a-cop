export const WORKSHOP_CLOUDFLARE_BINDINGS_V1: Readonly<{
  database: 'WORKSHOP_DB';
  packages: 'WORKSHOP_PACKAGES';
}>;

export const WORKSHOP_SERVER_ENVIRONMENT_V1: Readonly<Record<
  | 'discordClientId'
  | 'discordClientSecret'
  | 'discordRedirectUri'
  | 'sessionSecret'
  | 'adminDiscordIds'
  | 'allowedOrigins'
  | 'maxPackageBytes'
  | 'dailyRevisionLimit'
  | 'maxPublicItems'
  | 'maxUserStorageBytes'
  | 'maxTotalStorageBytes'
  | 'uploadEnabled'
  | 'turnstileSecretKey',
  string
>>;

export const WORKSHOP_CLIENT_ENVIRONMENT_V1: Readonly<{
  workshopEnabled: 'VITE_WORKSHOP_ENABLED';
  turnstileSiteKey: 'VITE_TURNSTILE_SITE_KEY';
}>;

export const WORKSHOP_ENVIRONMENT_DEFAULTS_V1: Readonly<{
  maxPackageBytes: 262144;
  dailyRevisionLimit: 20;
  maxPublicItems: 20;
  maxUserStorageBytes: 10485760;
  maxTotalStorageBytes: 4294967296;
  uploadEnabled: false;
  workshopEnabled: false;
}>;

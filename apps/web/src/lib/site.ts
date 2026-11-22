export const SITE_NAME = "Briesa API";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
/** Where customers send requests. The API runs on its own host, separate from this site. */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3100";
export const MAIN_SITE_URL = "https://briesa.com";
export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? "support@briesa.com";
export const SITE_DESCRIPTION =
  "Australian compliance rules behind one API. Every result cites its rule, source and effective date for a person to review.";

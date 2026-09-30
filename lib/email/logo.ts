import { lockupWidth } from '@/components/brand/logo';

// The email band shows the Coil lockup as a PNG because most email clients
// strip inline SVG. The PNG is rendered at 2x its display size for high
// density screens; regenerate it with `npm run email:logo` when the logo changes.
export const EMAIL_LOGO_FILE = 'email/logo-cream.png';
export const EMAIL_LOGO_HEIGHT = 32;
export const EMAIL_LOGO_WIDTH = lockupWidth(EMAIL_LOGO_HEIGHT);
export const EMAIL_LOGO_SCALE = 2;

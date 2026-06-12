# Email Template Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign all 8 transactional email templates into the approved "navy band + white card" system with a real-Fraunces PNG wordmark, hero photos for order/message emails, and stat rows for the weekly digest.

**Architecture:** One shared shell — `EmailLayout` in `lib/email/templates/_layout.tsx` becomes the navy-band/white-card structure with optional `heroImageUrl`/`heroImageAlt`; all templates upgrade by construction. Image URLs ride the existing snapshot columns (`productImageUrlSnapshot` on orders and message threads — no new queries) through new optional `imagePath` fields on the dispatch interfaces. Spec: `docs/superpowers/specs/2026-06-12-email-template-redesign-design.md`.

**Tech Stack:** react-email v6 (unified package — do NOT import from `@react-email/components`), `@react-email/render` v2, satori (new devDependency) + existing sharp for the one-time wordmark PNG, tsx scripts with `--env-file=.env.development`, T3 env via `import { env } from '@/env'`.

**Verification model:** No component-test framework. Gates: `npm run check` (tsc + eslint + prettier) per task. Visual verification: `npm run email:preview:notifications` renders to `.dev-mail/` (dev no-send mode is automatic when `NODE_ENV !== 'production'`). Branch: `feature/email-template-redesign` (already checked out; spec committed). NEVER push until the final task. Email-client constraints throughout: inline styles only, hardcoded hex, no `object-fit`, explicit dimensions on images.

**Files touched (whole plan):**

- Create: `scripts/generate-email-wordmark.ts`, `public/email/wordmark-cream.png` (generated, committed)
- Modify: `package.json` (devDep + script), `lib/email/templates/_layout.tsx`, `lib/email/templates/new-message-email.tsx`, `lib/email/templates/order-notification-email.tsx`, `lib/email/templates/weekly-digest-email.tsx`, `lib/email/notifications.ts`, `lib/messaging/fan-out.ts`, `lib/actions/orders.ts`, `db/scripts/preview-notification-emails.tsx`
- Untouched by design: `lib/email/send.ts`, `verify-email.tsx`, `reset-password.tsx`, `seller-application-email.tsx`, `listing-takedown-email.tsx`, `system-test.tsx` (they inherit the shell)

---

### Task 1: Wordmark PNG + generation script

**Files:**

- Create: `scripts/generate-email-wordmark.ts`
- Create: `public/email/wordmark-cream.png` (generated output, committed)
- Modify: `package.json` (add `satori` devDependency; add `email:wordmark` script)

- [ ] **Step 1: Install satori**

Run: `npm install -D satori`
Expected: clean install (sharp is already a production dep — do not reinstall it).

- [ ] **Step 2: Write the generation script**

Create `scripts/generate-email-wordmark.ts`:

```ts
// One-time generator for the email wordmark: renders "Balikha" in real
// Fraunces to a transparent PNG so email clients that strip webfonts
// (Gmail, Outlook) still show the brand serif. Output is committed;
// re-run only when the wordmark changes.
//
// Fraunces TTF is fetched at script time from Google Fonts. The css2
// endpoint serves TTF source URLs when the request has no browser UA.
import { writeFile, mkdir } from 'node:fs/promises';
import satori from 'satori';
import sharp from 'sharp';

const CSS_URL = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500';
const OUT_PATH = 'public/email/wordmark-cream.png';
// 2x asset: rendered at 44px cap height, displayed at 22px in the band.
const FONT_SIZE = 44;

async function fetchFrauncesTtf(): Promise<ArrayBuffer> {
  const css = await fetch(CSS_URL, { headers: { 'User-Agent': '' } }).then((r) => {
    if (!r.ok) throw new Error(`Fonts CSS fetch failed: ${r.status}`);
    return r.text();
  });
  const match = css.match(/src: url\((https:[^)]+\.ttf)\)/);
  if (!match) throw new Error('No TTF URL found in fonts CSS — UA trick may have stopped working');
  const ttf = await fetch(match[1]);
  if (!ttf.ok) throw new Error(`TTF fetch failed: ${ttf.status}`);
  return ttf.arrayBuffer();
}

async function main() {
  const fontData = await fetchFrauncesTtf();
  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          color: '#FDFCF7',
          fontFamily: 'Fraunces',
          fontSize: FONT_SIZE,
          fontWeight: 500,
          letterSpacing: '-0.01em',
        },
        children: 'Balikha',
      },
    },
    {
      // Tight box: satori sizes to content when width/height are generous;
      // we trim transparent edges with sharp below.
      width: 400,
      height: 80,
      fonts: [{ name: 'Fraunces', data: fontData, weight: 500, style: 'normal' }],
    },
  );
  await mkdir('public/email', { recursive: true });
  const png = await sharp(Buffer.from(svg)).trim().png().toBuffer();
  const meta = await sharp(png).metadata();
  await writeFile(OUT_PATH, png);
  console.log(`wrote ${OUT_PATH} (${meta.width}x${meta.height})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: Add the npm script**

In `package.json` scripts (alphabetically near the other `email:*` entries):

```json
"email:wordmark": "tsx scripts/generate-email-wordmark.ts",
```

- [ ] **Step 4: Generate and verify**

Run: `npm run email:wordmark`
Expected: `wrote public/email/wordmark-cream.png (WxH)` with W roughly 150–220 and H roughly 50–64 (trimmed). Open the PNG (or `sips -g pixelWidth -g pixelHeight public/email/wordmark-cream.png`) and confirm cream serif "Balikha" on transparency. Record the printed WxH — Task 2 needs the aspect ratio to set the band `<img>` width (displayed height is 22px; width = round(22 × W / H)).

- [ ] **Step 5: Gates + commit**

Run: `npm run check` — all green.

```bash
git add scripts/generate-email-wordmark.ts public/email/wordmark-cream.png package.json package-lock.json
git commit -m "feat(email): generate Fraunces wordmark PNG for email header"
```

---

### Task 2: The shell — rewrite `EmailLayout`, add `EmailStatRows`

**Files:**

- Modify: `lib/email/templates/_layout.tsx`

`EmailButton` and `FallbackUrl` stay exactly as they are. Only `EmailLayout` is rewritten and `EmailStatRows` added.

- [ ] **Step 1: Rewrite `EmailLayout`**

Replace the `EmailLayoutProps` interface and `EmailLayout` function with:

```tsx
import { env } from '@/env';

interface EmailLayoutProps {
  // Preview text shows in the inbox row beneath the subject. Keep under
  // 90 chars; longer text gets clipped by clients.
  preview: string;
  // Optional editorial headline (Fraunces) rendered inside the card with a
  // vermilion tick. The transactional H1 for the message.
  heading?: string;
  // Optional hero photo (the piece the email is about), absolute URL.
  // Rendered full-width at the top of the card, never cropped (object-fit
  // is unsupported in Outlook). Decorative: layout must read fine without it.
  heroImageUrl?: string;
  heroImageAlt?: string;
  children: ReactNode;
}

// Shared shell for all transactional templates: navy band carrying the
// PNG wordmark (real Fraunces survives webfont-stripping clients), white
// card on the cream body, footer outside the card. Direction A of the
// 2026-06-12 email redesign spec.
//
// Email clients are stuck in the 2000s for CSS: inline styles only,
// hardcoded hex (clients strip <style>; DESIGN.md tokens need manual
// sync), explicit image dimensions, no object-fit.
export function EmailLayout({
  preview,
  heading,
  heroImageUrl,
  heroImageAlt,
  children,
}: EmailLayoutProps) {
  const wordmarkUrl = `${env.NEXT_PUBLIC_APP_URL}/email/wordmark-cream.png`;
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: '#FDFCF7',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
          color: '#1A2B3A',
        }}
      >
        <Container style={{ maxWidth: '560px', margin: '0 auto', padding: '40px 16px' }}>
          {/* Navy band — rounded top, square bottom; reads as one unit
              with the card below. */}
          <Section
            style={{
              backgroundColor: '#1A2B3A',
              borderRadius: '10px 10px 0 0',
              padding: '16px 24px',
            }}
          >
            <img
              src={wordmarkUrl}
              alt="Balikha"
              height={22}
              width={WORDMARK_DISPLAY_WIDTH}
              style={{ display: 'block', height: '22px', width: 'auto' }}
            />
          </Section>
          {/* White card. No top border — the band caps it. */}
          <Section
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E6DFD1',
              borderTop: '0',
              borderRadius: '0 0 10px 10px',
            }}
          >
            {heroImageUrl ? (
              <img
                src={heroImageUrl}
                alt={heroImageAlt ?? ''}
                style={{ display: 'block', width: '100%', height: 'auto' }}
              />
            ) : null}
            <div style={{ padding: '24px' }}>
              {heading ? (
                <Section style={{ margin: '0 0 24px' }}>
                  <Text
                    style={{
                      fontFamily: 'Fraunces, Georgia, "Times New Roman", serif',
                      fontSize: '28px',
                      fontWeight: 400,
                      lineHeight: 1.15,
                      letterSpacing: '-0.02em',
                      margin: 0,
                      color: '#1A2B3A',
                    }}
                  >
                    {heading}
                  </Text>
                  {/* Vermilion editorial tick — the single earned brand accent. */}
                  <div
                    style={{
                      width: '32px',
                      height: '3px',
                      backgroundColor: '#C8413C',
                      borderRadius: '2px',
                      marginTop: '14px',
                    }}
                  />
                </Section>
              ) : null}
              {children}
            </div>
          </Section>
          {/* Footer outside the card. The digest's in-body unsubscribe
              link is separate and unchanged (legal requirement). */}
          <Section style={{ marginTop: '20px' }}>
            <Text style={{ fontSize: '12px', color: '#52616F', margin: 0, lineHeight: 1.6 }}>
              Balikha, an artisan marketplace ·{' '}
              <a
                href="https://balikha.art"
                style={{ color: '#52616F', textDecoration: 'underline' }}
              >
                balikha.art
              </a>{' '}
              ·{' '}
              <a
                href={`${env.NEXT_PUBLIC_APP_URL}/account/notifications`}
                style={{ color: '#52616F', textDecoration: 'underline' }}
              >
                Email preferences
              </a>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
```

`WORDMARK_DISPLAY_WIDTH`: a module-level `const WORDMARK_DISPLAY_WIDTH = <N>;` where `<N> = round(22 × W / H)` from the actual PNG dimensions Task 1 printed (e.g. 180×56 → 71). Outlook needs the explicit width attribute; compute it from the real asset, with a comment naming the source dimensions.

- [ ] **Step 2: Add `EmailStatRows`**

Append to `_layout.tsx` after `FallbackUrl`:

```tsx
// Digest stat rows: large serif numeral beside its label, hairline rules
// between rows. Replaces prose bullet lists where the numbers ARE the
// message. Email-safe: a plain table, explicit borders, no flexbox.
export function EmailStatRows({ rows }: { rows: { value: number; label: string }[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.label}>
            <td
              style={{
                padding: '12px 16px 12px 0',
                borderBottom: i < rows.length - 1 ? '1px solid #E6DFD1' : 'none',
                fontFamily: 'Fraunces, Georgia, "Times New Roman", serif',
                fontSize: '28px',
                lineHeight: 1,
                color: '#1A2B3A',
                width: '1%',
                whiteSpace: 'nowrap',
                verticalAlign: 'middle',
              }}
            >
              {row.value}
            </td>
            <td
              style={{
                padding: '12px 0',
                borderBottom: i < rows.length - 1 ? '1px solid #E6DFD1' : 'none',
                fontSize: '14px',
                lineHeight: 1.4,
                color: '#52616F',
                verticalAlign: 'middle',
              }}
            >
              {row.label}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3: Gates + render sanity check**

Run: `npm run check` — all green.
Run: `npm run email:preview:notifications` then open the newest two files in `.dev-mail/` in a browser.
Expected: both existing notification emails render with navy band (wordmark image will 404 in the standalone HTML file unless the dev server is running — confirm the `<img src="http://localhost:3000/email/wordmark-cream.png">` URL is correct and loads with the dev server up), white card, heading inside the card, footer below.

- [ ] **Step 4: Commit**

```bash
git add lib/email/templates/_layout.tsx
git commit -m "feat(email): navy-band white-card shell + stat rows component"
```

---

### Task 3: Image plumbing — `imagePath` through dispatches into templates

**Files:**

- Modify: `lib/email/notifications.ts`
- Modify: `lib/messaging/fan-out.ts`
- Modify: `lib/actions/orders.ts`
- Modify: `lib/email/templates/new-message-email.tsx`
- Modify: `lib/email/templates/order-notification-email.tsx`

Both orders and message threads ALREADY snapshot the product's primary image at creation (`productImageUrlSnapshot` columns) — no new queries. Snapshot URLs may be app-relative (`/uploads/...`) or absolute (seeded external URLs), so absolutization must handle both.

- [ ] **Step 1: Extend the dispatch interfaces + absolutize**

In `lib/email/notifications.ts`:

Add to BOTH `MessageEmailDispatch` and `OrderEmailDispatch`:

```ts
  // Product photo for the hero block. RELATIVE app path or absolute URL
  // (image snapshots store either); null/undefined renders the imageless
  // card. Absolutized here like `url` — templates never see relative paths.
  imagePath?: string | null;
```

Below the existing `absoluteUrl` helper add:

```ts
// Image snapshots store either an app-relative path (/uploads/…) or an
// already-absolute external URL (seeded data). Normalize to absolute.
function absoluteImageUrl(path: string): string {
  return path.startsWith('http') ? path : absoluteUrl(path);
}
```

In `dispatchMessageEmail`, extend the `createElement(NewMessageEmail, {...})` props with:

```ts
        heroImageUrl: d.imagePath ? absoluteImageUrl(d.imagePath) : undefined,
```

In `dispatchOrderEmail` (the function that renders `OrderNotificationEmail` — locate it in the same file), extend its `createElement` props the same way:

```ts
        heroImageUrl: d.imagePath ? absoluteImageUrl(d.imagePath) : undefined,
```

- [ ] **Step 2: Populate `imagePath` at the three construction sites**

a. `lib/messaging/fan-out.ts` (~line 95) — the returned dispatch gains one field:

```ts
return {
  recipientUserId,
  heading: title,
  preview,
  url: recipientUrl,
  imagePath: thread.productImageUrlSnapshot,
};
```

(If tsc complains the thread type lacks the field, check the `MessageThread` type's source query — the column exists on `messageThreads` in `db/schema/app.ts`; extend the SELECT that builds the thread row rather than casting.)

b. `lib/actions/orders.ts` placeOrder (~line 513) — the `sellerEmail` dispatch gains:

```ts
  imagePath: result.productImageUrl,
```

The transaction already reads the primary image into the order snapshot (`productImageUrlSnapshot`, set near line 347); extend the transaction's return object with `productImageUrl: <the same snapshotted value>` where it already returns `productTitle` (~line 471), and its result type accordingly.

c. `lib/actions/orders.ts` `fanOutTransitionNotification`'s `queueEmail` (~line 796):

```ts
function queueEmail(r: Recipient, kind: OrderEmailKind) {
  dispatches.push({
    recipientUserId: r.userId,
    kind,
    orderReference: order.reference,
    productTitle: order.productTitleSnapshot,
    url: r.url,
    imagePath: order.productImageUrlSnapshot,
  });
}
```

(Same caveat: if the in-scope `order` row's SELECT doesn't include the column, add it to the SELECT.)

- [ ] **Step 3: Accept the hero in the two templates**

`lib/email/templates/new-message-email.tsx` — add to `NewMessageEmailProps`:

```ts
  // Absolute URL of the piece's photo, when the conversation has product
  // context. Omitted → imageless card.
  heroImageUrl?: string;
```

and pass through:

```tsx
export function NewMessageEmail({ heading, preview, conversationUrl, heroImageUrl }: NewMessageEmailProps) {
  return (
    <EmailLayout preview={heading} heading={heading} heroImageUrl={heroImageUrl} heroImageAlt="">
```

(`heroImageAlt=""`: for messages the heading already names the piece; an empty alt keeps image-blocking clients clean.)

`lib/email/templates/order-notification-email.tsx` — same pattern, but alt names the piece:

```ts
  heroImageUrl?: string;
```

```tsx
      <EmailLayout preview={heading} heading={heading} heroImageUrl={heroImageUrl} heroImageAlt={productTitle}>
```

(Adjust to the file's actual destructuring; `productTitle` is already a prop.)

- [ ] **Step 4: Gates + commit**

Run: `npm run check` — all green (tsc verifies every dispatch site and template prop lines up).

```bash
git add lib/email/notifications.ts lib/messaging/fan-out.ts lib/actions/orders.ts lib/email/templates/new-message-email.tsx lib/email/templates/order-notification-email.tsx
git commit -m "feat(email): product photo hero in order and message emails"
```

---

### Task 4: Weekly digest stat rows

**Files:**

- Modify: `lib/email/templates/weekly-digest-email.tsx`

- [ ] **Step 1: Replace the bullet block with `EmailStatRows`**

Replace the `line()` helper and the oat `<div>` block. The `lines` construction becomes:

```tsx
const rows = [
  {
    value: counts.newFollowers,
    label: counts.newFollowers === 1 ? 'new follower' : 'new followers',
  },
  {
    value: counts.appreciations,
    label: counts.appreciations === 1 ? 'appreciation on your work' : 'appreciations on your work',
  },
  {
    value: counts.comments,
    label: counts.comments === 1 ? 'comment on your work' : 'comments on your work',
  },
  {
    value: counts.newMessageThreads,
    label:
      counts.newMessageThreads === 1 ? 'new conversation started' : 'new conversations started',
  },
].filter((r) => r.value > 0);
```

and the oat block section becomes:

```tsx
<Section style={{ margin: '0 0 28px' }}>
  <EmailStatRows rows={rows} />
</Section>
```

Import `EmailStatRows` from `@/lib/email/templates/_layout`. Delete the now-unused `line()` helper. Everything else (intro, button, unsubscribe footer) stays.

- [ ] **Step 2: Gates + commit**

Run: `npm run check` — all green.

```bash
git add lib/email/templates/weekly-digest-email.tsx
git commit -m "feat(email): weekly digest stat rows"
```

---

### Task 5: All-templates preview + visual verification

**Files:**

- Modify: `db/scripts/preview-notification-emails.tsx`

- [ ] **Step 1: Extend the preview script to all 8 templates**

Keep the script's existing structure (each preview = one `sendEmail` call; dev mode captures to `.dev-mail/`). Cover every template with realistic sample props, the two image-bearing ones twice (with and without `heroImageUrl`). Imports come from each template file; image-bearing samples use a real dev upload so the hero renders when the dev server is up:

```tsx
const SAMPLE_IMAGE =
  '/uploads/updates/18b9a0c4-7ce8-49f0-9a3b-e2f2fde7beb2/update-1781174329349-0.jpg';
```

Previews to render (subjects make the `.dev-mail` filenames self-describing):

1. `NewMessageEmail` — existing sample, plus `heroImageUrl: \`${env.NEXT_PUBLIC_APP_URL}${SAMPLE_IMAGE}\``
2. `NewMessageEmail` — existing sample, no hero (subject suffixed "(no photo)")
3. `OrderNotificationEmail` — existing sample + hero
4. `OrderNotificationEmail` — existing sample, no hero (subject suffixed "(no photo)")
5. `WeeklyDigestEmail` — `{ shopName: 'Habian Heritage', counts: { newFollowers: 3, appreciations: 12, comments: 2, newMessageThreads: 1 }, studioUrl: absolute '/studio/hablon-heritage', unsubscribeUrl: absolute '/unsubscribe?token=preview' }`
6. `VerifyEmail` — `{ verifyUrl: absolute '/verify-email?token=preview' }`
7. `ResetPasswordEmail` — `{ resetUrl: absolute '/reset-password?token=preview' }`
8. `SellerApplicationEmail` — `{ heading: 'Your artist application was approved', body: 'Congratulations — your Balikha artist account is now active. You can start publishing your products and building your studio.', ctaLabel: 'Go to your dashboard', url: absolute '/dashboard' }`
9. `ListingTakedownEmail` — `{ productTitle: 'Hand-loomed cotton shawl #12', reason: 'Listing photos could not be verified as the seller's own work.', url: absolute '/dashboard/products' }`
10. `SystemTestEmail` — `{ recipientEmail: to }`

Use `env.NEXT_PUBLIC_APP_URL` (already importable as `import { env } from '@/env'`; the npm script loads `.env.development`) to build the absolute URLs. Match each template's REAL props interface — read each file first; the list above gives the sample VALUES, not authoritative prop names.

- [ ] **Step 2: Render and verify**

Run: `npm run email:preview:notifications`
Expected: 10 files in `.dev-mail/`, no render errors. With the dev server running, open each in a browser: navy band + wordmark image loads, white card, serif heading + tick inside the card, hero photo on the two image variants, stat rows in the digest, footer with both links.

- [ ] **Step 3: Gates + commit**

Run: `npm run check` — all green.

```bash
git add db/scripts/preview-notification-emails.tsx
git commit -m "feat(email): preview script covers all templates"
```

---

### Task 6: Push + PR (controller does the visual pass first — no merge)

- [ ] **Step 1:** Controller reviews all 10 previews (visual companion) and gets user confirmation if anything looks off.
- [ ] **Step 2:** `git push -u origin feature/email-template-redesign`
- [ ] **Step 3:** `gh pr create` — summary: shell redesign, wordmark asset + script, hero photos via snapshot columns, digest stat rows, all-templates preview. Test plan: `npm run check` green; 10 previews eyeballed; optionally one real send via `npm run email:test` in prod after merge.
- [ ] **Step 4:** Do NOT merge — user reviews the PR.

---

## Self-review notes

- **Spec coverage:** shell (Task 2), wordmark script + asset (Task 1), imagePath plumbing + per-template heroes (Task 3), digest stat rows (Task 4), all-templates preview verification (Task 5), PR without merge (Task 6). Spec's untouched files stay untouched (verify/reset/etc. inherit the shell via Task 2 only).
- **Type consistency:** `imagePath?: string | null` on both dispatch interfaces (Task 3 Step 1) matches the nullable snapshot columns fed in Step 2; templates take `heroImageUrl?: string` (absolute, post-normalization); `EmailLayout` takes `heroImageUrl?`/`heroImageAlt?` (Task 2) consumed in Task 3 Step 3. `EmailStatRows({ rows: { value, label }[] })` defined Task 2, consumed Task 4.
- **Known soft spots called out in-task rather than hidden:** the exact `WORDMARK_DISPLAY_WIDTH` value depends on Task 1's real output (formula given); the in-scope SELECTs at the three dispatch sites may need the snapshot column added (explicit instruction given); preview prop names must be checked against each template file (explicit instruction given).

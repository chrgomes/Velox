import { APIRequestContext, Page, expect, test } from '@playwright/test';

const LOCALES = [
  {
    code: 'en',
    button: 'English',
    signup: 'Create account',
    login: 'Log in',
    saved: 'Address saved.',
    logout: 'Log out',
  },
  {
    code: 'fr-CA',
    button: 'Français',
    signup: 'Créer le compte',
    login: 'Se connecter',
    saved: 'Adresse enregistrée.',
    logout: 'Se déconnecter',
  },
  {
    code: 'es-419',
    button: 'Español',
    signup: 'Crear cuenta',
    login: 'Iniciar sesión',
    saved: 'Dirección guardada.',
    logout: 'Cerrar sesión',
  },
];
const PASSWORD = 'Smoke-Test-Pass-2026';

async function verificationLink(request: APIRequestContext, email: string): Promise<string> {
  // Development-only mailbox endpoint (mounted when VELOX_APP_MODE=development).
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await request.get(`/api/v1/dev/emails?to=${encodeURIComponent(email)}`);
    const emails = (await res.json()) as { template: string; body_text: string }[];
    const match = emails
      .find((e) => e.template === 'verify_email')
      ?.body_text.match(/token=([\w-]+)/);
    if (match) return `/verify-email?token=${match[1]}`;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('verification email not found');
}

async function chooseLanguage(page: Page, label: string): Promise<void> {
  await page.locator(`header button[title="${label}"]`).first().click();
}

for (const loc of LOCALES) {
  test(`register, verify, log in, add address, log out [${loc.code}]`, async ({
    page,
    request,
  }) => {
    const email = `e2e-${loc.code.toLowerCase()}-${Date.now()}@example.com`;

    await page.goto('/register');
    await chooseLanguage(page, loc.button);
    await expect(page.locator('html')).toHaveAttribute('lang', loc.code);
    await page.fill('#reg-first', 'Edie');
    await page.fill('#reg-last', 'Tester');
    await page.fill('#reg-email', email);
    await page.fill('#reg-password', PASSWORD);
    await page.check('#reg-terms');
    await page.getByRole('button', { name: loc.signup, exact: true }).click();
    await expect(page).toHaveURL(/\/app\?welcome=1/);

    await page.goto(await verificationLink(request, email));
    await expect(page.locator('.bi-check-lg')).toBeVisible();

    await page.goto('/app/addresses?new=1');
    await page.fill('#a-name', 'Edie Tester');
    await page.fill('#a-street1', '100 Queen St W');
    await page.fill('#a-city', 'Toronto');
    await page.selectOption('#a-region', 'ON');
    await page.fill('#a-postal', 'M5H 2N2');
    await page.locator('form button[type=submit]').click();
    await expect(page.getByText(loc.saved)).toBeVisible();

    await page.getByRole('button', { name: loc.logout }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.fill('#login-email', email);
    await page.fill('#login-password', PASSWORD);
    await page.locator('form button[type=submit]').click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.locator('.bi-check-circle-fill').first()).toBeVisible();
  });
}

test('rate calculator shows labelled simulated rates @mobile', async ({ page }) => {
  await page.goto('/');
  await page.fill('[formcontrolname=from_postal]', 'M5H 2N2');
  await page.fill('[formcontrolname=to_postal]', '10001');
  await page.selectOption('[formcontrolname=to_country]', 'US');
  await page.getByRole('button', { name: 'Compare rates' }).click();
  await expect(page.getByText('Simulated data.')).toBeVisible();
  await expect(page.locator('li.card')).not.toHaveCount(0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test('protected pages redirect to login', async ({ page }) => {
  await page.goto('/app/addresses');
  await expect(page).toHaveURL(/\/login\?returnUrl=%2Fapp%2Faddresses/);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login/);
});

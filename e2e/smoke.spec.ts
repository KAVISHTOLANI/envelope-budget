import { expect, test } from '@playwright/test';
import { checkMobile, snap } from './helpers';

test('budget, spend, move money, review reports', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Give every dollar');
  await expect(page.locator('.hero .env-card').first()).toBeVisible();
  await page.waitForTimeout(1000);
  await snap(page, 'landing');
  await checkMobile(page, 'landing-mobile');

  await page.getByRole('link', { name: 'Open this month’s budget' }).click();
  await expect(page.getByTestId('rta')).toBeVisible();
  const hobbies = page.getByLabel('Assigned to Hobbies');
  await hobbies.fill('90');
  await hobbies.press('Enter');
  await expect(hobbies).toHaveValue('90.00');
  await page.getByLabel('From', { exact: true }).selectOption({ index: 1 });
  await page.getByLabel('To', { exact: true }).selectOption({ label: 'Hobbies' });
  await page.getByLabel('Amount', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Move' }).click();
  await expect(page.getByText(/Moved \$10.00 from/)).toBeVisible();
  await expect(page.getByLabel('Assigned to Hobbies')).toHaveValue('100.00');
  await snap(page, 'budget');
  await checkMobile(page);
  await page.reload();
  await expect(page.getByLabel('Assigned to Hobbies')).toHaveValue('100.00');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Transactions' }).click();
  await page.getByLabel('Payee').fill('Record shop');
  await page.getByLabel('Amount', { exact: true }).fill('32');
  await page.getByRole('combobox', { name: 'Envelope', exact: true }).selectOption({ label: 'Hobbies' });
  await page.getByRole('button', { name: 'Save transaction' }).click();
  await expect(page.getByText('Expense of $32.00 saved.')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Record shop', exact: true })).toBeVisible();
  await snap(page, 'transactions');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Reports' }).click();
  await expect(page.getByRole('heading', { name: 'Income and spending per month' })).toBeVisible();
  await page.waitForTimeout(900);
  await snap(page, 'reports');
  await checkMobile(page, 'reports-mobile');
});

import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const relief = readFileSync(new URL('./fixtures/relief.bil', import.meta.url));
const ortho = readFileSync(new URL('./fixtures/ortho.jpg', import.meta.url));

/** Sert les requêtes data.geopf.fr depuis les fichiers de test (y compris celles du worker). */
async function fakeIgn(context, { status = 200 } = {}) {
  await context.route(/data\.geopf\.fr/, (route) => {
    const url = route.request().url();
    if (status !== 200) return route.fulfill({ status, body: 'Service Unavailable', contentType: 'text/plain' });
    if (/x-bil/.test(decodeURIComponent(url))) {
      return route.fulfill({ status: 200, body: relief, contentType: 'image/x-bil;bits=32', headers: { 'access-control-allow-origin': '*' } });
    }
    return route.fulfill({ status: 200, body: ortho, contentType: 'image/jpeg', headers: { 'access-control-allow-origin': '*' } });
  });
}

function collectErrors(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

test('vol de base avec relief simulé', async ({ page, context }) => {
  await fakeIgn(context);
  const errors = collectErrors(page);
  await page.goto('/?stride=16'); // maillage allégé : le navigateur de test dessine sans carte graphique
  await expect(page.getByText('© IGN — cartes.gouv.fr')).toBeVisible();

  await page.getByRole('button', { name: 'Décoller' }).click();
  await expect(page.locator('#hud-alt')).toHaveText(/^\d[\d\s ]* m$/);

  // Des carrés finissent par arriver.
  await expect.poll(() => page.evaluate(() => window.__sim.visibleCount()), { timeout: 20_000 }).toBeGreaterThan(0);

  await page.getByLabel('Destination').selectOption({ label: `La Meije (${(3983).toLocaleString('fr-FR')} m)` });
  await page.getByRole('button', { name: 'Y aller' }).click();
  await expect(page.getByText('Pilote auto : La Meije')).toBeVisible();

  // Le planeur avance.
  const x0 = await page.evaluate(() => window.__sim.glider.x);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__sim.glider.x)).not.toBe(x0);

  expect(errors).toEqual([]);
});

test('IGN indisponible : la page reste utilisable', async ({ page, context }) => {
  await fakeIgn(context, { status: 503 });
  await page.goto('/?stride=16'); // maillage allégé : le navigateur de test dessine sans carte graphique
  await page.getByRole('button', { name: 'Décoller' }).click();
  // Ligne discrète dans le panneau de droite, pas de bandeau au milieu de l'écran.
  await expect(page.locator('#panel-note')).toHaveText(/Relief en partie indisponible/, { timeout: 20_000 });
  await expect(page.locator('#message')).toBeHidden();
  await expect(page.locator('#hud-alt')).toHaveText(/\d/);
  // Les commandes répondent toujours.
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__sim.glider.bank)).toBeGreaterThan(0);
  await page.keyboard.up('ArrowRight');
});

test('?debug&ortho=wmts : panneau de mesure et orthophoto en tuiles WMTS', async ({ page, context }) => {
  const urls = [];
  await context.route(/data\.geopf\.fr/, (route) => {
    const url = decodeURIComponent(route.request().url());
    urls.push(url);
    if (/x-bil/.test(url)) return route.fulfill({ status: 200, body: relief, contentType: 'image/x-bil;bits=32' });
    return route.fulfill({ status: 200, body: ortho, contentType: 'image/jpeg' });
  });
  const errors = collectErrors(page);
  await page.goto('/?stride=16&debug&ortho=wmts');
  await page.getByRole('button', { name: 'Décoller' }).click();
  await expect(page.locator('#debug')).toContainText('WMTS (grille PM)', { timeout: 10_000 });
  await expect(page.locator('#debug')).toContainText(/Orthophoto, moyenne : \d+ ms/, { timeout: 20_000 });
  expect(urls.some((u) => u.includes('/wmts?') && u.includes('TILEMATRIXSET=PM'))).toBe(true);
  expect(errors).toEqual([]);
});

test('phase 1 bis : commandes clavier, allures et vues', async ({ page, context }) => {
  await fakeIgn(context);
  const errors = collectErrors(page);
  await page.goto('/?stride=16');
  await page.getByRole('button', { name: 'Décoller' }).click();

  // Flèche haut : le nez baisse (comme un manche d'avion).
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__sim.glider.pitchCmd)).toBeLessThan(-0.3);
  await page.keyboard.up('ArrowUp');

  // Allures : + accélère, − ralentit ; les boutons font pareil.
  await expect(page.locator('#hud-allure')).toHaveText('Promenade');
  await page.keyboard.press('+');
  await expect(page.locator('#hud-allure')).toHaveText('Voyage');
  await page.getByRole('button', { name: 'Moins vite' }).click();
  await page.getByRole('button', { name: 'Moins vite' }).click();
  await expect(page.locator('#hud-allure')).toHaveText('Flânerie');

  // Vues au pavé numérique.
  for (const [key, name] of [['4', 'gauche'], ['6', 'droite'], ['2', 'arrière'], ['0', 'dessous'], ['8', 'devant']]) {
    await page.keyboard.press(key);
    await expect(page.locator('#hud-view')).toHaveText(`Vue : ${name}`);
  }
  expect(errors).toEqual([]);
});

test('phase 1 bis : noms des lieux (i), carte (m) et distance', async ({ page, context }) => {
  await fakeIgn(context);
  const errors = collectErrors(page);
  await page.goto('/?stride=16');
  await page.getByRole('button', { name: 'Décoller' }).click();
  await expect.poll(() => page.evaluate(() => window.__sim.labelCount()), { timeout: 10_000 }).toBeGreaterThan(1000);

  // Distance à la destination choisie, en permanence.
  await page.getByLabel('Destination').selectOption({ label: `La Meije (${(3983).toLocaleString('fr-FR')} m)` });
  await expect(page.locator('#hud-target')).toHaveText(/^La Meije : [\d\s ,]+ (k?m)$/);

  await page.keyboard.press('i');
  await expect.poll(() => page.evaluate(() => window.__sim.shownLabels().length), { timeout: 5000 }).toBeGreaterThan(0);
  await expect(page.locator('.place-label:not([hidden])').first()).toBeVisible();
  await page.keyboard.press('i');
  await expect(page.locator('.place-label:not([hidden])')).toHaveCount(0);

  await expect(page.locator('#minimap')).toBeHidden();
  await page.keyboard.press('m');
  await expect(page.locator('#minimap')).toBeVisible();
  await page.keyboard.press('m');
  await expect(page.locator('#minimap')).toBeHidden();
  expect(errors).toEqual([]);
});

test('pause, aide « ? », affichage immersif, plus de grosses flèches', async ({ page, context }) => {
  await fakeIgn(context);
  const errors = collectErrors(page);
  await page.goto('/?stride=16');
  await page.getByRole('button', { name: 'Décoller' }).click();
  await expect(page.locator('#controls')).toHaveCount(0);

  // Barre d'espace : le planeur s'arrête, puis repart.
  await page.keyboard.press(' ');
  await expect(page.locator('#paused')).toBeVisible();
  const x0 = await page.evaluate(() => window.__sim.glider.x);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__sim.glider.x)).toBe(x0);
  await page.keyboard.press(' ');
  await expect(page.locator('#paused')).toBeHidden();
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__sim.glider.x)).not.toBe(x0);

  // Bouton « ? » : pause et liste des commandes.
  await page.getByRole('button', { name: 'Aide et commandes' }).click();
  await expect(page.getByRole('dialog')).toContainText('Barre d\'espace');
  expect(await page.evaluate(() => window.__sim.isPaused())).toBe(true);
  await page.getByRole('button', { name: 'Reprendre le vol' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(await page.evaluate(() => window.__sim.isPaused())).toBe(false);

  // Touche h : rien que le paysage, un petit bouton pour revenir.
  await page.keyboard.press('h');
  await expect(page.locator('#hud')).toBeHidden();
  await expect(page.locator('#panel')).toBeHidden();
  await expect(page.locator('#help-btn')).toBeHidden();
  await page.getByRole('button', { name: 'Afficher' }).click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Afficher' })).toBeHidden();
  expect(errors).toEqual([]);
});

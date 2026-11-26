import { icone } from '../ui.js';
import { monterCarte } from '../carte-voie.js';

// Plan interactif de la ligne : tracé, PK, gares, passages à niveau, évitements, tiroirs et problèmes en cours.
export async function afficher(ctx) {
  const pannes = await ctx.api.pannes({ cible: 'voie' }).catch(() => []);
  const el = ctx.rendre(`
  <div class="barre"><a class="retour" href="#/voie" data-retour aria-label="Retour à la voie">${icone('retour')}</a><h1>Plan de la ligne</h1></div>
  <div class="page plan-page"><div id="plan" class="plan"></div></div>`);
  if (!el) return;
  const plan = monterCarte(el.querySelector('#plan'), { pannes });
  const id = ctx.params?.[0];
  if (id) plan.choisir('panne:' + id);
}

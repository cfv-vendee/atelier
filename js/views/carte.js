import { icone, peutInspecter, toast } from '../ui.js';
import { monterCarte } from '../carte-voie.js';

// Plan interactif de la ligne : tracé, PK, gares, passages à niveau, ouvrages, évitements, tiroirs et problèmes en cours.
// Les référents voie et les administrateurs peuvent corriger les éléments tirés d'OpenStreetMap et en ajouter.
export async function afficher(ctx) {
  const { api, moi } = ctx;
  const [pannes, elements] = await Promise.all([api.pannes({ cible: 'voie' }).catch(() => []), api.voieElements().catch(() => [])]);
  const el = ctx.rendre(`
  <div class="barre"><a class="retour" href="#/voie" data-retour aria-label="Retour à la voie">${icone('retour')}</a><h1>Plan de la ligne</h1></div>
  <div class="page plan-page"><div id="plan" class="plan"></div></div>`);
  if (!el) return;
  const zone = el.querySelector('#plan');
  let plan, corrections = elements;
  const monter = (etat) => {
    plan?.destroy();
    plan = monterCarte(zone, { pannes, corrections, peutModifier: peutInspecter(moi), etat, choisi: etat?.selection || null,
      onSauver: async (e) => { await api.sauverVoieElement(e); await rafraichir(e.masque === true ? 'Élément retiré. Retrouvez-le dans « Éléments retirés de la carte ».' : e.masque === false && !('pk' in e) && !('nom' in e) && !('genre' in e) && !('pn_type' in e) ? 'Élément rétabli sur la carte.' : 'Plan mis à jour.'); },
      onSupprimer: async (id) => { await api.supprimerVoieElement(id); await rafraichir('Élément supprimé.'); } });
  };
  async function rafraichir(message = 'Plan mis à jour.') {
    const etat = plan?.etat();
    corrections = await api.voieElements().catch(() => corrections);
    monter(etat);
    toast(message);
  }
  monter(null);
  const id = ctx.params?.[0];
  if (id) plan.choisir('panne:' + id);
}

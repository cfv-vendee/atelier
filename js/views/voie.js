import { esc, icone, pastille, GRAVITES, STATUTS, ELEMENTS, formatPk, quand, peutSignaler, peutInspecter, LIGNE } from '../ui.js';
import { tourneeEnCours, ligneTournee } from './tournee.js';
import { voieConfiguree } from './releve.js';

let voirReparees = false;

export async function afficher(ctx) {
  const { api, moi } = ctx;
  const [toutes, tournees, params] = await Promise.all([api.pannes({ cible: 'voie' }), api.tournees({ limite: 10 }).catch(() => []),
    peutInspecter(moi) ? api.parametres().catch(() => ({})) : {}]);
  const releve = peutInspecter(moi) && !voieConfiguree(params);
  const active = peutInspecter(moi) ? tourneeEnCours(moi.id) : null;
  const el = ctx.rendre(`
  <div class="entete"><h1>La voie</h1><div class="aide" style="font-size:14px">Mortagne-sur-Sèvre – Les Herbiers · PK ${LIGNE.pkDebut} à ${LIGNE.pkFin}</div></div>
  <div class="page" style="padding-top:8px">
    ${active ? `<a class="btn grand" href="#/tournee" style="background:var(--orange)">${icone('voie')}Reprendre la tournée en cours</a>`
      : peutInspecter(moi) ? `<a class="btn grand" href="#/tournee">${icone('voie')}Démarrer une tournée d'inspection</a>` : ''}
    ${peutSignaler(moi) ? `<a class="btn second" href="#/signaler?cible=voie">${icone('plus', 20)}Signaler un problème ponctuel</a>` : ''}
    ${releve ? `<a class="carte pad lien-carte" href="#/releve"><b>${icone('pin', 20)} Configuration de la voie : relevé des repères PK</b>
      <span class="aide">Réservé aux référents voie et aux administrateurs. À faire une fois, sur le terrain, pour le plan et le calcul automatique du PK.</span></a>` : ''}
    <div class="bandeau">Le plan interactif de la ligne arrivera une fois les repères PK relevés. En attendant, les problèmes sont classés par point kilométrique.</div>
    <div class="segments" role="group" aria-label="Affichage">
      <button type="button" data-r="0">À traiter</button><button type="button" data-r="1">Tout l'historique</button>
    </div>
    <div class="carte liste" id="liste"></div>
    <h2 class="titre-section">Tournées d'inspection</h2>
    <div class="carte liste">${tournees.map(ligneTournee).join('') || '<p class="vide">Aucune tournée pour le moment.</p>'}</div>
  </div>`);
  if (!el) return;
  const maj = () => {
    el.querySelectorAll('[data-r]').forEach((b) => b.setAttribute('aria-pressed', (b.dataset.r === '1') === voirReparees));
    const l = toutes.filter((p) => voirReparees || p.statut !== 'reparee').sort((a, b) => (a.pk ?? 99) - (b.pk ?? 99));
    el.querySelector('#liste').innerHTML = l.map((p) => `
      <a class="ligne" href="#/panne/${p.id}">
        <span class="code grey" style="width:58px;font-size:12px">${p.pk != null ? 'PK<br>' + esc(formatPk(p.pk).replace('PK ', '')) : 'GPS'}</span>
        <span class="txt"><span class="t">${esc(p.titre)}</span>
          <span class="m"><span class="point" style="display:inline-block;width:8px;height:8px;background:${GRAVITES[p.gravite].couleur}"></span> ${esc(GRAVITES[p.gravite].label)} · ${esc(ELEMENTS[p.element])} · ${esc(quand(p.created_at))}</span></span>
        ${pastille(STATUTS[p.statut])}
      </a>`).join('') || `<p class="vide">${voirReparees ? 'Aucun signalement sur la voie.' : 'Rien à traiter sur la voie.'}</p>`;
  };
  el.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => { voirReparees = b.dataset.r === '1'; maj(); }));
  maj();
}

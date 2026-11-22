import { esc, icone, pastille, GRAVITES, STATUTS, ROLES, quand, sujetPanne, nomEngin, peutSignaler } from '../ui.js';

export const lignePanne = (p) => `
  <a class="ligne" href="#/panne/${p.id}">
    <span class="point" style="background:${GRAVITES[p.gravite].couleur}" title="${esc(GRAVITES[p.gravite].label)}"></span>
    <span class="txt"><span class="t">${esc(p.titre)}</span><span class="m">${esc(sujetPanne(p))} · ${esc(quand(p.created_at))}</span></span>
    ${pastille(STATUTS[p.statut])}
  </a>`;

export async function afficher(ctx) {
  const { api, moi } = ctx;
  const [ouvertes, recentes, engins] = await Promise.all([api.pannes({ ouvertes: true }), api.pannes({ limite: 8 }), api.engins()]);
  const bloquantes = ouvertes.filter((p) => p.gravite === 'bloquante').length;
  const voie = ouvertes.filter((p) => p.cible === 'voie').length;
  const immobilises = engins.filter((e) => e.etat === 'immobilise');
  const role = moi.est_admin ? `${ROLES[moi.role].label} · admin` : ROLES[moi.role].label;

  ctx.rendre(`
  <div class="entete" style="display:flex;align-items:center;gap:12px">
    <img src="img/logo.png" alt="Logo du CFV" style="width:52px;height:52px;object-fit:contain">
    <div style="flex:1"><h1 style="font-size:20px">CFV Atelier</h1>
      <div class="aide" style="font-size:14px">Bonjour ${esc(moi.prenom)} · ${esc(role)}</div></div>
  </div>
  <div class="page">
    ${peutSignaler(moi) ? `<a class="btn grand" href="#/signaler">${icone('plus')}Signaler un problème</a>` : ''}
    <div class="stats">
      <a class="stat" href="#/materiel" style="text-decoration:none;color:inherit"><b>${ouvertes.length}</b><span>Pannes ouvertes</span></a>
      <div class="stat ${bloquantes ? 'alerte' : ''}"><b>${bloquantes}</b><span>Bloquantes</span></div>
      <a class="stat" href="#/voie" style="text-decoration:none;color:inherit"><b>${voie}</b><span>Points voie à traiter</span></a>
    </div>
    ${immobilises.length ? `<h2 class="titre-section">Matériel immobilisé</h2><div class="cartes">${immobilises.map((e) => {
      const p = ouvertes.find((x) => x.engin_id === e.id && x.gravite === 'bloquante');
      return `<a class="ligne" href="#/engin/${e.id}"><span class="code red">${icone('materiel', 22)}</span>
        <span class="txt"><span class="t">${esc(nomEngin(e))}</span><span class="m">${esc(p ? p.titre : '')}</span></span>${pastille({ label: 'Bloquante', cls: 'red' })}</a>`;
    }).join('')}</div>` : ''}
    <h2 class="titre-section">Dernières déclarations</h2>
    <div class="carte liste">${recentes.map(lignePanne).join('') || '<p class="vide">Aucune déclaration pour le moment.</p>'}</div>
  </div>`);
}

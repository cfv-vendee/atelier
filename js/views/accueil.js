import { esc, icone, pastille, GRAVITES, STATUTS, ROLES, quand, sujetPanne, nomEngin, peutSignaler, toast } from '../ui.js';
import { scannerQR, idEnginDepuisQR } from '../scanner.js';

export const lignePanne = (p) => `
  <a class="ligne" href="#/panne/${p.id}">
    <span class="point" style="background:${GRAVITES[p.gravite].couleur}" title="${esc(GRAVITES[p.gravite].label)}"></span>
    <span class="txt"><span class="t">${esc(p.titre)}</span><span class="m">${esc(sujetPanne(p))} · ${esc(quand(p.created_at))}</span></span>
    ${pastille(STATUTS[p.statut])}
  </a>`;

export async function afficher(ctx) {
  const { api, moi } = ctx;
  const [ouvertes, recentes, engins, enAttente] = await Promise.all([api.pannes({ ouvertes: true }), api.pannes({ limite: 8 }), api.engins(), ctx.envois.lister().catch(() => [])]);
  const bloquantes = ouvertes.filter((p) => p.gravite === 'bloquante').length;
  const voie = ouvertes.filter((p) => p.cible === 'voie').length;
  const immobilises = engins.filter((e) => e.etat === 'immobilise');
  const role = moi.est_admin ? `${ROLES[moi.role].label} · admin` : ROLES[moi.role].label;

  const el = ctx.rendre(`
  <div class="entete" style="display:flex;align-items:center;gap:12px">
    <img src="img/logo.png" alt="Logo du CFV" style="width:52px;height:52px;object-fit:contain">
    <div style="flex:1"><h1 style="font-size:20px">CFV Atelier</h1>
      <div class="aide" style="font-size:14px">Bonjour ${esc(moi.prenom)} · ${esc(role)}</div></div>
  </div>
  <div class="page">
    ${peutSignaler(moi) ? `<a class="btn grand" href="#/signaler">${icone('plus')}Signaler un problème</a>` : ''}
    <button class="btn second plein" id="scanner">${icone('qr', 22)}Scanner le QR code d'un engin</button>
    ${enAttente.length ? `<h2 class="titre-section">En attente d'envoi (${enAttente.length})</h2>
    <div class="carte liste" id="attente">${enAttente.map((it) => `
      <div class="ligne">
        <span class="code orange" aria-hidden="true">${icone('envoi', 22)}</span>
        <span class="txt"><span class="t">${esc(it.resume || 'Envoi')}</span>
          <span class="m">${it.type === 'panne' ? 'Signalement' : 'Mise à jour'} · fait ${esc(quand(it.cree))}${it.fichiers?.length ? ` · ${it.fichiers.length} photo${it.fichiers.length > 1 ? 's' : ''}` : ''}</span>
          ${it.erreur ? `<span class="erreur" style="font-size:13px">Refusé : ${esc(it.erreur)}</span>` : ''}</span>
        ${it.erreur ? `<button class="btn danger" style="min-height:44px;padding:0 12px;font-size:14px" data-retirer="${esc(it.id)}">Supprimer</button>` : ''}
      </div>`).join('')}
      <div style="padding:10px 14px"><button class="btn second plein" id="renvoyer">Envoyer maintenant</button></div>
    </div>` : ''}
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
  if (!el) return;
  el.querySelector('#renvoyer')?.addEventListener('click', async () => {
    if (!navigator.onLine) { toast('Toujours pas de réseau : nouvel essai automatique dès son retour.'); return; }
    const n = await ctx.envois.synchroniser();
    toast(n ? `${n} envoi${n > 1 ? 's' : ''} effectué${n > 1 ? 's' : ''}.` : "Rien n'a pu être envoyé pour l'instant.");
    ctx.aller('accueil');
  });
  el.querySelectorAll('[data-retirer]').forEach((b) => (b.onclick = async () => {
    if (!b.dataset.confirme) { b.dataset.confirme = '1'; b.textContent = 'Confirmer'; return; }
    await ctx.envois.retirer(b.dataset.retirer); ctx.aller('accueil');
  }));
  el.querySelector('#scanner').onclick = async () => {
    const texte = await scannerQR();
    if (!texte) return;
    const id = idEnginDepuisQR(texte);
    const engin = id ? await ctx.api.engin(id).catch(() => null) : null;
    if (engin) ctx.aller('engin/' + id);
    else toast(id ? "Cette étiquette ne correspond à aucun engin du CFV (ancienne étiquette ou étiquette de démonstration ?)." : "Ce QR code n'est pas une étiquette CFV Atelier.");
  };
}

#!/usr/bin/env python3 -I
# Génère js/voie-cfv.js (plan de la ligne Les Herbiers – Mortagne-sur-Sèvre) à partir de données ouvertes :
#   - tracé, gares, passages à niveau, ouvrages : OpenStreetMap (ODbL), via les tuiles vectorielles de Carto Tchoo
#   - points kilométriques : SNCF Réseau (opendata), via le dépôt github.com/nicolaswurtz/extras-opendata-sncf-reseau (ODbL)
# Usage : outils/generer-carte-voie.py <tiles.json> <pks.csv> <sortie.js>
import csv, heapq, json, math, sys
tiles, pkcsv, sortie = sys.argv[1:4]
F = json.load(open(tiles))
LAT0 = 46.93
KX, KY = 111320 * math.cos(math.radians(LAT0)), 110540
m = lambda p: ((p[0] + 1) * KX, (p[1] - LAT0) * KY)          # (lon, lat) -> mètres locaux
dist = lambda a, b: math.hypot(a[0] - b[0], a[1] - b[1])
def longueur(c): return sum(dist(m(a), m(b)) for a, b in zip(c, c[1:]))

# ── 1. Tous les morceaux de voie (couches « tracks » et « routes »), hors ligne SNCF Clisson–Cholet ──
# Les tuiles se chevauchent : un même rail apparaît plusieurs fois, légèrement décalé. On fusionne donc les sommets
# distants de moins de 1,5 m, ce qui ressoude aussi les morceaux coupés aux bords des tuiles.
morceaux = []
for f in F['tracks']:
    p = f['properties']; g = f['geometry']
    if p.get('name') == 'Ligne de Clisson à Cholet': continue
    for c in ([g['coordinates']] if g['type'] == 'LineString' else g['coordinates']):
        if len(c) >= 2: morceaux.append((c, p.get('service')))
for f in F['routes']:
    if f['properties'].get('name') != 'Chemin de fer de la Vendée': continue
    g = f['geometry']
    for c in ([g['coordinates']] if g['type'] == 'LineString' else g['coordinates']):
        if len(c) >= 2: morceaux.append((c, None))
grille, noeuds = {}, []                       # noeuds : positions (m) ; grille : cellule -> indices
def noeud(pt):
    q = m(pt); cx, cy = int(q[0] // 3), int(q[1] // 3)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for i in grille.get((cx + dx, cy + dy), []):
                if dist(noeuds[i], q) < 1.5: return i
    noeuds.append(q); grille.setdefault((cx, cy), []).append(len(noeuds) - 1); return len(noeuds) - 1
aretes, services = {}, {}                     # (a, b) -> longueur ; service de l'arête
for c, service in morceaux:
    ids = [noeud(pt) for pt in c]
    for a, b in zip(ids, ids[1:]):
        if a == b or max(noeuds[a][1], noeuds[b][1]) / KY + LAT0 > 46.9975: continue   # au-delà de Mortagne : ligne SNCF
        k = (min(a, b), max(a, b)); aretes[k] = dist(noeuds[a], noeuds[b]); services[k] = service or services.get(k)
voisins = {}
for (a, b), L in aretes.items(): voisins.setdefault(a, []).append((b, L)); voisins.setdefault(b, []).append((a, L))
# Les morceaux coupés aux bords des tuiles se chevauchent sans partager de sommet : on relie chaque bout libre
# au sommet le plus proche d'un autre morceau (moins de 150 m). Ces liaisons ne servent qu'au calcul du trajet.
compo, cid = {}, 0
for s0 in list(voisins):
    if s0 in compo: continue
    pile = [s0]; compo[s0] = cid
    while pile:
        u = pile.pop()
        for v, _ in voisins[u]:
            if v not in compo: compo[v] = cid; pile.append(v)
    cid += 1
for u in [u for u in voisins if len(voisins[u]) == 1]:
    cand = [(dist(noeuds[u], noeuds[v]), v) for v in voisins if compo[v] != compo[u]]
    if not cand: continue
    dd, v = min(cand)
    if dd < 150: voisins[u].append((v, dd)); voisins[v].append((u, dd))
def plus_proche(pt):
    q = m(pt); return min(voisins, key=lambda i: dist(noeuds[i], q))
depart = plus_proche([-1.011971, 46.86329])      # heurtoir de la gare des Herbiers
arrivee = plus_proche([-0.944422, 46.994586])    # gare de Mortagne-sur-Sèvre
d, prec, tas = {depart: 0}, {}, [(0, depart)]
while tas:
    dd, u = heapq.heappop(tas)
    if dd > d.get(u, 1e18): continue
    for v, L in voisins[u]:
        if dd + L < d.get(v, 1e18): d[v], prec[v] = dd + L, u; heapq.heappush(tas, (dd + L, v))
if arrivee not in d: sys.exit('Pas de chemin entre Les Herbiers et Mortagne : tracé OSM incomplet')
ids, u = [arrivee], arrivee
while u != depart: u = prec[u]; ids.append(u)
ids.reverse()
unproj = lambda q: [q[0] / KX - 1, q[1] / KY + LAT0]
principale = [unproj(noeuds[i]) for i in ids]
sur_principale = set(ids); P_set = [noeuds[i] for i in ids]
def ecart_ligne(q):
    best = 1e18
    for a, b in zip(P_set, P_set[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]; l2 = dx * dx + dy * dy or 1e-9
        t = max(0, min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)); best = min(best, math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy))
    return best

# ── 3. Voies annexes : évitement (relie la ligne en deux endroits) ou tiroir (cul-de-sac) ──
hors = {k for k in aretes if not (k[0] in sur_principale and k[1] in sur_principale) and
        ecart_ligne(((noeuds[k[0]][0] + noeuds[k[1]][0]) / 2, (noeuds[k[0]][1] + noeuds[k[1]][1]) / 2)) > 6}
adj_h = {}
for a, b in hors: adj_h.setdefault(a, []).append(b); adj_h.setdefault(b, []).append(a)
vus_n, annexes = set(), []
for n0 in adj_h:
    if n0 in vus_n: continue
    comp, pile = set(), [n0]
    while pile:
        u = pile.pop()
        if u in comp: continue
        comp.add(u); pile += adj_h[u]
    vus_n |= comp
    ar = [k for k in hors if k[0] in comp]
    L = sum(aretes[k] for k in ar)
    rattaches = [u for u in comp if ecart_ligne(noeuds[u]) < 6]
    if not rattaches or L < 15: continue
    xs = sorted(ecart_ligne(noeuds[u]) * 0 + noeuds[u][0] for u in rattaches)
    separes = len(rattaches) >= 2 and max(dist(noeuds[a], noeuds[b]) for a in rattaches for b in rattaches) > 30
    genre = 'evitement' if separes and not any(services.get(k) in ('spur', 'yard') for k in ar) else 'tiroir'
    # reconstitue des polylignes en suivant les chaînes de sommets de degré 2
    reste, polys = set(ar), []
    deg = {u: len(adj_h[u]) for u in comp}
    while reste:
        k = next((x for x in reste if deg[x[0]] != 2 or deg[x[1]] != 2), next(iter(reste)))
        a, b = (k[0], k[1]) if deg[k[0]] != 2 else (k[1], k[0])
        ch = [a, b]; reste.discard(k)
        while deg[ch[-1]] == 2:
            suite = [x for x in reste if ch[-1] in x]
            if not suite: break
            x = suite[0]; reste.discard(x); ch.append(x[0] if x[1] == ch[-1] else x[1])
        polys.append([unproj(noeuds[i]) for i in ch])
    for c in polys: annexes.append({'c': c, 'genre': genre, 'L': longueur(c)})

# Les tuiles se chevauchent et la relation de route double certains rails : on retire les annexes qui en recouvrent
# déjà une autre (plus longue) à moins de 4 m, et les fragments de moins de 20 m.
def echantillons(c):
    pts = [m(q) for q in c]; out = list(pts)
    for a, b in zip(pts, pts[1:]):
        n = int(dist(a, b) // 5)
        out += [(a[0] + (b[0] - a[0]) * i / (n + 1), a[1] + (b[1] - a[1]) * i / (n + 1)) for i in range(1, n + 1)]
    return out
def ecart_poly(q, poly):
    best = 1e18
    for a, b in zip(poly, poly[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]; l2 = dx * dx + dy * dy or 1e-9
        t = max(0, min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)); best = min(best, math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy))
    return best
gardees = []
for a in sorted(annexes, key=lambda a: -a['L']):
    if a['L'] < 20: continue
    ech = echantillons(a['c'])
    deja = sum(1 for q in ech if any(ecart_poly(q, [m(x) for x in g['c']]) < 4 for g in gardees))
    if deja / len(ech) < 0.7: gardees.append(a)
annexes = gardees

# ── 4. Abscisse curviligne de la ligne principale, PK SNCF ───────────────────────
P = [m(p) for p in principale]
cum = [0]
for a, b in zip(P, P[1:]): cum.append(cum[-1] + dist(a, b))
def projeter(pt, poly=P, cumul=cum):
    q = m(pt) if len(pt) == 2 and abs(pt[0]) < 5 else pt; best = (1e18, 0)
    for i in range(len(poly) - 1):
        ax, ay = poly[i]; bx, by = poly[i + 1]; dx, dy = bx - ax, by - ay; l2 = dx * dx + dy * dy or 1e-9
        t = max(0, min(1, ((q[0] - ax) * dx + (q[1] - ay) * dy) / l2))
        px, py = ax + t * dx, ay + t * dy; e = math.hypot(q[0] - px, q[1] - py)
        if e < best[0]: best = (e, cumul[i] + t * math.sqrt(l2))
    return best      # (écart m, abscisse m)
repres = []
for r in csv.DictReader(open(pkcsv, newline='', encoding='utf-8')):
    if r['code_ligne'] != '526000': continue
    try: pk, lat, lon = float(r['pk']), float(r['lat']), float(r['lon'])
    except ValueError: continue
    if 46.85 <= lat <= 47.0:
        e, s = projeter([lon, lat])
        if e < 120: repres.append((s, pk))
repres.sort()
# pente moyenne : le PK augmente-t-il vers Mortagne ? (1 pk = 1000 m)
(s0, p0), (s1, p1) = repres[0], repres[-1]
sens = 1 if p1 > p0 else -1
def pk_en(s):
    for (sa, pa), (sb, pb) in zip(repres, repres[1:]):
        if sa <= s <= sb and sb > sa: return pa + (pb - pa) * (s - sa) / (sb - sa)
    return p0 + sens * (s - s0) / 1000 if s < s0 else p1 + sens * (s - s1) / 1000
def s_en_pk(pk):
    for (sa, pa), (sb, pb) in zip(repres, repres[1:]):
        if min(pa, pb) <= pk <= max(pa, pb) and pb != pa: return sa + (sb - sa) * (pk - pa) / (pb - pa)
    return None
print('repères PK SNCF utilisés :', len(repres), '| PK', round(pk_en(0), 2), '→', round(pk_en(cum[-1]), 2), '| longueur', round(cum[-1]), 'm | sens', sens)

# ── 5. Éléments ponctuels ────────────────────────────────────────────────────────
def element(pt, **kw):
    e, s = projeter(pt)
    return {**kw, 'lng': round(pt[0], 6), 'lat': round(pt[1], 6), 'pk': round(pk_en(s), 3), 'ecart': round(e)}
gares = [element(f['geometry']['coordinates'], nom=f['properties']['name']) for f in F['stations']
         if f['properties'].get('name') in ('Les Herbiers', 'Les Épesses', 'Chambretaud', 'Saint-Laurent-sur-Sèvre', 'Mortagne-sur-Sèvre')]
gares.sort(key=lambda g: g['pk'])
pn_bruts = []
for f in F['level_crossings']:
    p = f['properties']; pt = f['geometry']['coordinates']
    e = element(pt, nom=p.get('name') or (('PN ' + p['ref']) if p.get('ref') else None), barriere=p.get('crossing:barrier'),
                feux=p.get('crossing:light'), cloche=p.get('crossing:bell'))
    if e['ecart'] > 40 or not e['nom']: continue     # hors de la ligne du CFV (ligne SNCF voisine), ou sans nom
    pn_bruts.append(e)
pn, vus_pn = [], []
for e in sorted(pn_bruts, key=lambda e: (e['nom'], -sum(x is not None for x in (e['barriere'], e['feux'])))):
    if any(v['nom'].split(' BIS')[0] == e['nom'].split(' BIS')[0] and v['nom'].endswith('BIS') == e['nom'].endswith('BIS') and
           dist(m([v['lng'], v['lat']]), m([e['lng'], e['lat']])) < 40 for v in vus_pn): continue
    vus_pn.append(e); pn.append(e)
def typePn(e):
    if e['feux'] == 'yes': return 'auto'            # feux + cloche : passage à niveau automatique
    if e['barriere'] in ('full', 'half', 'double_half', 'yes'): return 'barrieres'
    return None                                     # à préciser sur le terrain
for e in pn: e['type'] = typePn(e); [e.pop(k) for k in ('barriere', 'feux', 'cloche', 'ecart')]
pn.sort(key=lambda e: e['pk'])
for g in gares: g.pop('ecart')
ouvrages = []
for lay, genre in (('bridges', 'pont'), ('tunnels', 'tunnel')):
    for f in F[lay]:
        p = f['properties']; g = f['geometry']
        if p.get('name') == 'Ligne de Clisson à Cholet' or p.get('ref') == '527000': continue
        c = g['coordinates'] if g['type'] == 'LineString' else [x for l in g['coordinates'] for x in l]
        mil = c[len(c) // 2]; e, s = projeter(mil)
        if e > 40: continue
        ouvrages.append({'genre': genre, 'nom': p.get('name') if p.get('name') not in ('Chemin de fer touristique de la Vendée', 'Chemin de Fer de la Vendée') else None,
                         'pk': round(pk_en(s), 3), 'longueur': round(longueur(c)), 'c': c})
tampons = []
for f in F['buffer_stops']:
    pt = f['geometry']['coordinates']; e, s = projeter(pt)
    if e < 60 and not any(dist(m(pt), m(t)) < 3 for t in [[t['lng'], t['lat']] for t in tampons]): tampons.append({'lng': round(pt[0], 6), 'lat': round(pt[1], 6)})
# jalons PK : tous les kilomètres entiers le long de la ligne principale
def point_a(s):
    for i in range(len(P) - 1):
        if cum[i] <= s <= cum[i + 1]:
            t = (s - cum[i]) / ((cum[i + 1] - cum[i]) or 1)
            a, b = principale[i], principale[i + 1]; return [round(a[0] + (b[0] - a[0]) * t, 6), round(a[1] + (b[1] - a[1]) * t, 6)]
jalons = []
k = math.ceil(min(pk_en(0), pk_en(cum[-1])))
while k <= max(pk_en(0), pk_en(cum[-1])):
    s = s_en_pk(k)
    if s is not None and 0 <= s <= cum[-1]: jalons.append({'pk': k, 'c': point_a(s)})
    k += 1

# ── 6. Simplification (Douglas-Peucker, 1,5 m) et écriture ───────────────────────
def dp(c, eps=1.5):
    if len(c) < 3: return c
    A, B = m(c[0]), m(c[-1]); best, bi = 0, 0
    for i in range(1, len(c) - 1):
        q = m(c[i]); dx, dy = B[0] - A[0], B[1] - A[1]; l2 = dx * dx + dy * dy or 1e-9
        t = max(0, min(1, ((q[0] - A[0]) * dx + (q[1] - A[1]) * dy) / l2)); e = math.hypot(q[0] - A[0] - t * dx, q[1] - A[1] - t * dy)
        if e > best: best, bi = e, i
    return dp(c[:bi + 1], eps)[:-1] + dp(c[bi:], eps) if best > eps else [c[0], c[-1]]
arr = lambda c: [[round(x[0], 5), round(x[1], 5)] for x in dp(c)]
for o in ouvrages: o['c'] = arr(o['c'])
sortie_json = {
    'ligne': arr(principale), 'longueurM': round(cum[-1]), 'pkDebut': round(pk_en(0), 3), 'pkFin': round(pk_en(cum[-1]), 3),
    'annexes': [{'genre': a['genre'], 'c': arr(a['c'])} for a in annexes],
    'gares': gares, 'pn': pn, 'ouvrages': ouvrages, 'tampons': tampons, 'jalons': jalons,
}
with open(sortie, 'w', encoding='utf-8') as f:
    f.write('// Plan de la ligne Les Herbiers – Mortagne-sur-Sèvre. Fichier généré par outils/generer-carte-voie.py : ne pas modifier à la main.\n'
            '// Sources : © contributeurs OpenStreetMap (ODbL) pour le tracé, les gares, les passages à niveau et les ouvrages ;\n'
            '// SNCF Réseau (open data, via Carto Tchoo) pour les points kilométriques. À corriger avec le relevé de terrain.\n'
            'export const VOIE = ' + json.dumps(sortie_json, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('gares', [(g['nom'], g['pk']) for g in gares])
print('PN', len(pn), [(e['nom'], e['pk'], e['type']) for e in pn])
print('annexes', [(a['genre'], round(a['L'])) for a in annexes])
print('ouvrages', [(o['genre'], o['nom'], o['pk'], o['longueur']) for o in ouvrages], '| tampons', len(tampons), '| jalons', [j['pk'] for j in jalons])

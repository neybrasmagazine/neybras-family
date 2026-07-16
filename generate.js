// Static site generator: Ghost export -> Crafto-styled HTML
// Reads content-export.json (copied Ghost export) and writes index.html,
// articles/<slug>.html, and root-level page files.

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const EXPORT_PATH = path.join(ROOT, 'content-export.json');
const data = JSON.parse(fs.readFileSync(EXPORT_PATH, 'utf8')).db[0].data;

const SITE = {
  title: 'Neybras Family Magazine',
  description: "Le média des familles marocaines exigeantes. Éducation, argent, décisions familiales — sans bruit.",
  domain: 'https://neybras-family.com', // canonical host — www redirects here (see CNAME + GitHub Pages config)
  social: {
    facebook: 'https://web.facebook.com/profile.php?id=61580744324089',
    instagram: 'https://instagram.com/neybrasfamily',
    linkedin: 'https://linkedin.com/company/neybrasfamily/'
  },
  ga: 'G-XXXXXXXXXX', // TODO: replace with a real GA4 measurement ID for neybras-family.com before going live
  // Sampled directly from the real brand asset (site-dalal/images/Neybras Family Logo.png)
  prune: '#7A5268'
};

// ---- Build lookup maps ----
const tagsById = new Map(data.tags.map(t => [t.id, t]));
const postTagByPostId = new Map();
for (const pt of data.posts_tags) {
  if (!postTagByPostId.has(pt.post_id)) postTagByPostId.set(pt.post_id, []);
  postTagByPostId.get(pt.post_id).push(tagsById.get(pt.tag_id));
}

const allPosts = data.posts.filter(p => p.type === 'post' && p.status === 'published')
  .sort((a, b) => new Date(a.published_at) - new Date(b.published_at));
const allPages = data.posts.filter(p => p.type === 'page' && p.status === 'published');

// Spread original publish dates (all clustered in April 2026) evenly across the
// 3 months up to today, preserving relative order, so the relaunched site looks
// freshly and continuously active rather than dormant since April.
{
  const today = new Date();
  const start = new Date(today);
  start.setMonth(start.getMonth() - 3);
  const spanMs = today - start;
  const n = allPosts.length;
  allPosts.forEach((p, i) => {
    const t = n === 1 ? spanMs : (i / (n - 1)) * spanMs;
    p.published_at = new Date(start.getTime() + t).toISOString();
  });
}
allPosts.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

// slug -> local relative path (from site root), used to rewrite internal __GHOST_URL__ links
const slugToPath = new Map();
for (const p of allPosts) slugToPath.set(p.slug, `articles/${p.slug}.html`);
for (const p of allPages) slugToPath.set(p.slug, `${p.slug}.html`);

function rewriteContent(html, fromArticlesDir) {
  if (!html) return '';
  const prefix = fromArticlesDir ? '../' : '';
  // internal links: __GHOST_URL__/slug/ -> local path
  html = html.replace(/__GHOST_URL__\/([a-z0-9-]+)\/?/g, (m, slug) => {
    const target = slugToPath.get(slug);
    return target ? prefix + target : m.replace('__GHOST_URL__', SITE.domain);
  });
  // remaining asset refs (images/etc.)
  html = html.replace(/__GHOST_URL__\/content\/images\//g, `${prefix}images/content/`);
  html = html.replace(/__GHOST_URL__/g, SITE.domain);
  return html;
}

function imagePath(ghostUrl, fromArticlesDir) {
  if (!ghostUrl) return null;
  const prefix = fromArticlesDir ? '../' : '';
  return ghostUrl
    .replace('__GHOST_URL__/content/images/', `${prefix}images/content/`)
    .replace(/\.(jpe?g|png)$/i, '.webp');
}

const dateFmt = iso => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const readingTime = post => {
  const words = (post.plaintext || '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
};

// ---- Shared chrome (header / footer) ----
function head(title, description, fromArticlesDir, canonicalPath = '', extraHead = '') {
  const prefix = fromArticlesDir ? '../' : '';
  return `<!doctype html>
<html class="no-js" lang="fr">
    <head>
        <title>${title}</title>
        <meta charset="utf-8">
        <meta http-equiv="X-UA-Compatible" content="IE=edge" />
        <meta name="author" content="Neybras Family">
        <meta name="viewport" content="width=device-width,initial-scale=1.0" />
        <meta name="description" content="${description}">
        <link rel="canonical" href="${SITE.domain}/${canonicalPath}">
        <link rel="icon" type="image/png" href="${prefix}images/favicon.png">
        <link rel="apple-touch-icon" href="${prefix}images/apple-touch-icon.png">
        <link rel="manifest" href="${prefix}site.webmanifest">
        <link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap">
        <link rel="stylesheet" href="${prefix}css/vendors.min.css"/>
        <link rel="stylesheet" href="${prefix}css/icon.min.css"/>
        <link rel="stylesheet" href="${prefix}css/style.min.css"/>
        <link rel="stylesheet" href="${prefix}css/responsive.min.css"/>
        <link rel="stylesheet" href="${prefix}demos/magazine/magazine.css" />
        <link rel="stylesheet" href="${prefix}css/ghost-content.css" />
        <script async src="https://www.googletagmanager.com/gtag/js?id=${SITE.ga}"></script>
        <script>
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${SITE.ga}');
        </script>
        ${extraHead}
    </head>
    <body data-mobile-nav-style="classic">
        <div class="box-layout">`;
}

function header(fromArticlesDir) {
  const prefix = fromArticlesDir ? '../' : '';
  const navTags = data.tags.map(t => `<li class="nav-item"><a href="${prefix}categorie-${t.slug}.html" class="nav-link">${t.name}</a></li>`).join('\n');
  return `
            <header>
                <nav class="navbar navbar-expand-lg bg-white header-light disable-fixed">
                    <div class="container-fluid">
                        <div class="col-auto col-xxl-3 col-lg-2 me-lg-0 me-auto">
                            <div class="header-icon">
                                <div class="header-push-button icon">
                                    <div class="push-button"><span></span><span></span><span></span><span></span></div>
                                </div>
                            </div>
                            <a class="navbar-brand d-flex align-items-center" href="${prefix}index.html">
                                <img src="${prefix}images/favicon.png" alt="Neybras Family" width="40" height="40" style="border-radius:6px;">
                                <span class="d-inline-block ms-15px lh-14">
                                    <span class="d-block ls-1px" style="font-family:'Fraunces',serif;font-weight:600;font-size:19px;color:${SITE.prune};">Neybras Family</span>
                                    <span class="d-block fs-11 text-uppercase opacity-6" style="letter-spacing:2px;">Magazine</span>
                                </span>
                            </a>
                        </div>
                        <div class="col-auto menu-order position-static">
                            <button class="navbar-toggler float-start" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-label="Toggle navigation">
                                <span class="navbar-toggler-line"></span><span class="navbar-toggler-line"></span><span class="navbar-toggler-line"></span><span class="navbar-toggler-line"></span>
                            </button>
                            <div class="collapse navbar-collapse" id="navbarNav">
                                <ul class="navbar-nav">
                                    <li class="nav-item"><a href="${prefix}index.html" class="nav-link">Accueil</a></li>
                                    ${navTags}
                                    <li class="nav-item"><a href="${prefix}a-propos.html" class="nav-link">À propos</a></li>
                                </ul>
                            </div>
                        </div>
                        <div class="col-auto col-xxl-3 col-xl-2 text-end md-pe-0">
                            <div class="header-icon">
                                <div class="header-search-icon icon d-none d-md-flex">
                                    <a href="#" class="search-form-icon header-search-form fw-800 text-uppercase"><i class="feather icon-feather-search text-dark-gray align-middle me-5px xl-me-0"></i><span class="fs-15 align-middle d-none d-xxl-inline-block">Rechercher</span></a>
                                    <div class="search-form-wrapper">
                                        <button title="Fermer" type="button" class="search-close">×</button>
                                        <form id="search-form" role="search" method="get" class="search-form text-left" onsubmit="return false;">
                                            <div class="search-form-box">
                                                <h2 class="text-dark-gray text-center mb-4 fw-700 ls-minus-2px">Que recherchez-vous ?</h2>
                                                <input class="search-input border-color-dark-gray" placeholder="Entrez un mot-clé..." name="s" type="text" autocomplete="off">
                                                <button type="submit" class="search-button"><i class="feather icon-feather-search" aria-hidden="true"></i></button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </nav>
                <div class="push-menu push-menu-style-2 ps-50px pe-50px pt-4 pb-4 bg-white">
                    <span class="close-menu text-dark-gray text-dark-gray-hover"><i class="fa-solid fa-xmark fs-20"></i></span>
                    <div class="d-flex flex-column align-items-center justify-content-center h-100">
                        <div class="hamburger-menu menu-list-wrapper w-90 lg-w-100 lg-no-margin" data-scroll-options='{ "theme": "light" }'>
                            <ul class="text-dark-gray menu-item-list alt-font fw-700 ls-minus-1px">
                                <li class="nav-item"><a href="${prefix}index.html" class="nav-link">Accueil</a></li>
                                ${navTags}
                                <li class="nav-item"><a href="${prefix}a-propos.html" class="nav-link">À propos</a></li>
                            </ul>
                        </div>
                        <div class="text-center elements-social social-icon-style-04">
                            <ul class="medium-icon dark">
                                <li class="mx-0"><a class="facebook" href="${SITE.social.facebook}" target="_blank" rel="noopener"><i class="fa-brands fa-facebook-f"></i><span></span></a></li>
                                <li class="mx-0"><a class="instagram" href="${SITE.social.instagram}" target="_blank" rel="noopener"><i class="fa-brands fa-instagram"></i><span></span></a></li>
                                <li class="mx-0"><a class="linkedin" href="${SITE.social.linkedin}" target="_blank" rel="noopener"><i class="fa-brands fa-linkedin-in"></i><span></span></a></li>
                            </ul>
                        </div>
                    </div>
                </div>
            </header>`;
}

function footer(fromArticlesDir) {
  const prefix = fromArticlesDir ? '../' : '';
  const footerCatLinks = data.tags.map(t => `
                                <li class="mb-10px"><a href="${prefix}categorie-${t.slug}.html" class="fs-14 text-dark-gray text-decoration-line-bottom">${t.name}</a></li>`).join('');
  const footerTools = [TOOL_VACANCES, ...TOOLS];
  const footerToolLinks = footerTools.map(t => `
                                <li class="mb-10px"><a href="${prefix}${t.href}" class="fs-14 text-dark-gray text-decoration-line-bottom">${t.navLabel}</a></li>`).join('');
  return `
            <footer class="bg-very-light-gray">
                <div class="container position-relative">
                    <div class="footer-top pt-6 pb-5">
                        <div class="row">
                            <div class="col-lg-4 mb-30px mb-lg-0">
                                <a href="${prefix}index.html" class="d-inline-flex align-items-center mb-15px">
                                    <img src="${prefix}images/favicon.png" alt="Neybras Family" width="36" height="36" style="border-radius:6px;">
                                    <span class="ms-10px" style="font-family:'Fraunces',serif;font-weight:600;font-size:18px;color:${SITE.prune};">Neybras Family</span>
                                </a>
                                <p class="fs-14 text-dark-gray" style="max-width:280px;">Le magazine des familles marocaines exigeantes — argent, éducation, droit et vie de famille, sans bruit.</p>
                            </div>
                            <div class="col-6 col-lg-4 mb-30px mb-lg-0">
                                <span class="fs-13 fw-700 text-uppercase d-block mb-15px" style="letter-spacing:1px;color:${SITE.prune};">Catégories</span>
                                <ul class="list-unstyled mb-0">${footerCatLinks}
                                </ul>
                            </div>
                            <div class="col-6 col-lg-4">
                                <span class="fs-13 fw-700 text-uppercase d-block mb-15px" style="letter-spacing:1px;color:${SITE.prune};">Outils gratuits</span>
                                <ul class="list-unstyled mb-0">${footerToolLinks}
                                </ul>
                            </div>
                        </div>
                    </div>
                    <div class="footer-bottom pt-6" style="border-top:1px solid #e7e1de;">
                        <div class="row justify-content-center">
                            <div class="col-12 text-center mb-15px">
                                <span class="fs-11 text-uppercase fw-600 d-inline-block px-15px py-5px border-radius-20px" style="letter-spacing:1.5px;color:${SITE.prune};border:1px solid ${SITE.prune};">Neybras Média Group</span>
                            </div>
                            <div class="col-12 last-paragraph-no-margin text-center mb-30px">
                                <p class="fs-15 text-dark-gray">&copy; ${new Date().getFullYear()} Neybras Publishing SARLAU — Tous droits réservés.</p>
                                <a href="${prefix}mentions-legales.html" class="fs-14 text-dark-gray text-decoration-line-bottom">Mentions légales</a>
                            </div>
                            <div class="col-12 text-center">
                                <div class="elements-social social-icon-style-02">
                                    <ul class="large-icon dark">
                                        <li><a class="facebook" href="${SITE.social.facebook}" target="_blank" rel="noopener"><i class="fa-brands fa-facebook-f"></i></a></li>
                                        <li><a class="instagram" href="${SITE.social.instagram}" target="_blank" rel="noopener"><i class="fa-brands fa-instagram"></i></a></li>
                                        <li><a class="linkedin" href="${SITE.social.linkedin}" target="_blank" rel="noopener"><i class="fa-brands fa-linkedin-in"></i></a></li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
        <div class="scroll-progress d-none d-xxl-block">
            <a href="#" class="scroll-top" aria-label="scroll"><span class="scroll-text">Scroll</span><span class="scroll-line"><span class="scroll-point"></span></span></a>
        </div>
        <script type="text/javascript" src="${prefix}js/jquery.js"></script>
        <script type="text/javascript" src="${prefix}js/vendors.min.js"></script>
        <script type="text/javascript" src="${prefix}js/main.js"></script>
        <script>
        (function(){
          // Unique micro-interaction partagée (refonte premium) : fade-in discret au scroll
          // pour les blocs .nf-fade-in (duo-photo À propos, grille destinations, avantages newsletter).
          if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
          var targets = document.querySelectorAll('.nf-fade-in');
          if (!targets.length || !('IntersectionObserver' in window)) return;
          var io = new IntersectionObserver(function(entries){
            entries.forEach(function(entry){
              if (entry.isIntersecting) { entry.target.classList.add('nf-visible'); io.unobserve(entry.target); }
            });
          }, { threshold: 0.15 });
          targets.forEach(function(el){ io.observe(el); });
        })();
        </script>
    </body>
</html>`;
}

// Hand-written teasers (curiosity-gap, 2 sentences / ~25-30 words, one striking fact —
// not a mechanical excerpt of the article). Keyed by slug; falls back to a plain
// truncation until each one is written and approved.
const EXCERPTS = {
  'escapades-familiales-maroc-budget-3000-mad': "Cascades, océan, oasis, médinas : le Maroc regorge d'escapades familiales sous les 3 000 MAD. Laquelle de ces 10 adresses correspond à votre budget week-end ?",
  'cout-education-privee-maroc-budget': "Entre préscolaire et diplôme, l'éducation privée peut coûter jusqu'à 900 000 MAD par enfant au Maroc. Voici comment les familles CSP+ planifient réellement ce budget.",
  'divorce-maroc-moudawana-procedures-droits': "Depuis la réforme de 2004, la Moudawana prévoit plusieurs voies de divorce, aux conséquences patrimoniales très différentes. Laquelle protège le mieux vos droits ?",
  'nutrition-familiale-maroc-petit-budget': "37 % du budget des familles marocaines part dans l'alimentation — sans que cela rime avec équilibre nutritionnel. La cuisine traditionnelle cache une solution simple.",
  'equilibre-travail-famille-maroc-strategies': "Le taux d'activité des femmes marocaines stagne à 20 %, l'un des plus faibles au monde. Certaines solutions existent déjà dans la loi.",
  'etudes-etranger-maroc-guide-preparation': "Chaque année, des milliers de bacheliers marocains partent étudier à l'étranger — certains reviennent dès la première année. Ce qui fait la différence.",
  'orientation-bac-universite-publique-privee-maroc': "Le choix entre université publique et privée est souvent pris dans l'urgence, sous pression sociale. Le bon critère n'est pourtant pas celui qu'on croit.",
  'reduire-charges-foyer-maroc-astuces-economies': "Les charges fixes absorbent jusqu'à 35 % des revenus d'un foyer marocain — sans qu'aucun contrat n'ait jamais été renégocié. 10 leviers chiffrés pour inverser la tendance.",
  'week-ends-nature-casablanca-escapades-famille': "À moins de 30 minutes de Casablanca, un poumon vert gratuit attend les familles en mal de nature. 7 autres échappées sont à moins de 2 heures.",
  'confiance-en-soi-enfant-maroc': "Un enfant confiant n'est pas celui qui réussit tout, mais celui qui ose échouer. 5 techniques, déjà testées par des familles marocaines.",
  'strategie-financiere-famille-maroc-plan': "Structurer les finances d'un foyer n'est plus réservé aux grandes fortunes marocaines — c'est devenu une nécessité pour tous. Par où commencer, concrètement.",
  'erreurs-financieres-familles-maroc-pieges': "De l'absence d'épargne de précaution au surendettement immobilier, certaines erreurs reviennent sans cesse chez les familles marocaines. 7 pièges à repérer à temps.",
  'finance-patrimoine-familial-maroc-strategies': "De la gestion budgétaire quotidienne à la transmission patrimoniale : notre rubrique décrypte ce qui compte vraiment pour les familles marocaines CSP+.",
  'garde-enfants-hadana-maroc-conditions': "La Moudawana place la mère en tête de la garde des enfants — à condition de respecter des règles précises. Leur non-respect peut tout remettre en cause.",
  'pension-alimentaire-nafaqa-maroc-calcul': "Ne pas payer la pension alimentaire est une infraction pénale au Maroc. Pourtant, faire exécuter un jugement de nafaqa reste l'un des plus grands défis judiciaires.",
  'autorite-parentale-wilaya-tutelle-maroc': "La wilaya, tutelle légale sur l'enfant mineur, ne s'arrête pas à la séparation des parents. Comment l'autorité se partage réellement après un divorce.",
  'heritage-succession-droit-musulman-maroc': "Le droit successoral marocain repose sur deux mécanismes bien distincts de répartition du patrimoine. Les ignorer expose les héritiers à l'indivision et aux conflits.",
  'responsabilite-ecoles-privees-maroc-accidents': "Un accident scolaire n'engage pas la responsabilité de l'établissement de la même façon selon qu'il est public ou privé. Ce que la loi prévoit réellement.",
  'education-numerique-maroc-etat-lieux': "La pandémie a révélé une fracture numérique persistante entre zones urbaines et rurales, écoles privées et publiques. L'état réel de l'EdTech marocaine.",
  'congelation-ovocytes-maroc-preservation-fertilite': "Entre projets de vie et horloge biologique, la congélation d'ovocytes redéfinit la liberté reproductive des femmes marocaines. Comment fonctionne cette technique en plein essor.",
  // Corrigés (forme) suite à relecture :
  'epargne-enfants-maroc-placements-strategie': "1 000 MAD épargnés chaque mois dès la naissance peuvent devenir plus de 324 000 MAD au bac de votre enfant. Voici le calcul — et pourquoi si peu de familles l'utilisent.",
  'intelligence-artificielle-maroc-etat-lieux': "UM6P, ENSIAS, EMI : les universités marocaines accélèrent sur l'intelligence artificielle. Mais entre les laboratoires et les salles de classe, l'écart se creuse.",
  // Revus après vérification des sources dans le corps de l'article :
  'langlais-pour-lenfant-la-competence-cle-du-futur': "Le français reste la langue de l'administration au Maroc — mais l'anglais est devenu le vrai passeport pour les formations internationales. Comment l'installer sans forcer.",
  'competences-futures-enfant-maroc': "Beaucoup des métiers de demain n'existent pas encore. 7 compétences déterminent déjà qui sera prêt à les occuper — et qui ne le sera pas.",
  'creativite-enfant-activites-intelligence': "Dans un monde où les machines automatisent la logique, la créativité reste l'une des compétences les moins enseignées à l'école. 12 activités changent la donne à la maison.",
  'cyberharcelement-enfants-maroc-protection': "Plus de 80 % des enfants marocains de 10 à 17 ans utilisent Internet, selon l'ANRT et l'UNICEF. Ce que ça change pour la protection numérique en famille.",
  'budget-familial-maroc-methodes-outils': "Selon le HCP, l'alimentation et le logement absorbent l'essentiel du budget des ménages marocains. Ce que ce constat national révèle sur la vraie marge de manœuvre des familles.",
  // Jamais couverts par la relecture — à confirmer à l'occasion, pas de statistique
  // contestée dans ceux-là donc appliqués par défaut :
  'calendrier-vaccinal-enfant-maroc-vaccins': "Le programme national de vaccination couvre 11 maladies, gratuitement, de la naissance au bac. Le calendrier complet des rendez-vous à ne jamais manquer.",
  'outils-numeriques-reussite-scolaire-recherche': "Les outils numériques améliorent-ils vraiment les résultats scolaires ? La recherche répond — mais à une condition précise que peu de familles respectent.",
  // Vérifié : chantier réglementaire réel (BAM) mais toujours en cours, pas "acté" —
  // "tournant historique" aurait surpromis. Voir source ajoutée en bas de l'article.
  'fintech-maroc-mobile-banking-crowdfunding': "Bank Al-Maghrib pousse l'interopérabilité du paiement mobile — mais l'usage commercial reste sous les 10 % des transactions. Ce que ça change déjà pour les familles, et ce qui reste à venir.",
};

// ---- Article card (used on homepage + category pages) ----
function articleCard(post, fromArticlesDir) {
  const tag = (postTagByPostId.get(post.id) || [])[0];
  const img = imagePath(post.feature_image, fromArticlesDir) || 'https://placehold.co/600x415';
  const prefix = fromArticlesDir ? '../' : '';
  const href = `${prefix}articles/${post.slug}.html`;
  const excerpt = EXCERPTS[post.slug] || post.custom_excerpt || (post.plaintext || '').slice(0, 140).trim() + '…';
  return `
        <li class="grid-item">
            <div class="blog-box d-lg-flex d-block flex-row h-100 overflow-hidden box-shadow-double-large">
                <div class="blog-image w-45 md-w-100 position-relative overflow-hidden">
                    <img src="${img}" alt="${post.title}" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">
                    <a href="${href}" class="blog-post-image-overlay"></a>
                </div>
                <div class="blog-content w-55 md-w-100 p-50px bg-white d-flex flex-column justify-content-center align-items-start lg-p-30px last-paragraph-no-margin">
                    ${tag ? `<a href="${prefix}categorie-${tag.slug}.html" class="categories-btn bg-base-color text-white btn-box-shadow text-uppercase fw-600 mb-20px">${tag.name}</a>` : ''}
                    <a href="${href}" class="card-title text-dark-gray mb-15px fw-600 fs-22 alt-font w-95">${post.title}</a>
                    <p>${excerpt}</p>
                    <span class="card-meta text-uppercase mt-15px d-block">Par Rédaction Neybras Family &middot; ${dateFmt(post.published_at)} &middot; ${readingTime(post)} min de lecture</span>
                </div>
            </div>
        </li>`;
}

// ---- Sidebar "Sélection de la rédaction" + "Explorer les catégories" (home, page 1 uniquement) ----
// Nommé "Sélection de la rédaction" et non "Articles populaires" : le site n'a pas encore de
// données de trafic réelles, on ne prétend pas en avoir (voir règle "pas de faux chiffres").
function sidebarPickItem(post) {
  const img = imagePath(post.feature_image, false);
  return `
                                <li class="d-flex align-items-start mb-20px">
                                    <a href="articles/${post.slug}.html" class="flex-shrink-0 d-block position-relative overflow-hidden border-radius-6px" style="width:64px;height:64px;">
                                        <img src="${img}" alt="${post.title}" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">
                                    </a>
                                    <div class="ps-15px">
                                        <a href="articles/${post.slug}.html" class="d-block text-dark-gray fw-600 fs-14" style="line-height:1.35;">${post.title}</a>
                                        <span class="fs-11 text-uppercase" style="color:${SITE.prune};letter-spacing:.5px;">${dateFmt(post.published_at)}</span>
                                    </div>
                                </li>`;
}

function sidebarCategoryTile(tag) {
  const repPost = allPosts.find(p => (postTagByPostId.get(p.id) || []).some(t => t.id === tag.id));
  const img = repPost ? imagePath(repPost.feature_image, false) : 'https://placehold.co/300x200';
  return `
                                <a href="categorie-${tag.slug}.html" class="d-block position-relative overflow-hidden border-radius-6px mb-10px" style="height:84px;">
                                    <img src="${img}" alt="${tag.name}" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .4s ease;">
                                    <span class="position-absolute inset-0" style="position:absolute;inset:0;background:linear-gradient(180deg,transparent 40%,rgba(15,10,12,.78) 100%);"></span>
                                    <span class="position-absolute bottom-0 start-0 w-100 p-15px text-white fw-700 fs-14">${tag.name}</span>
                                </a>`;
}

function buildHomeSidebar() {
  const picks = allPosts.slice(3, 8); // 5 posts distincts des 3 déjà en hero
  return `
                        <div class="col-lg-4">
                            <div class="ps-lg-30px mt-5 mt-lg-0">
                                <div class="mb-50px">
                                    <h3 class="alt-font text-dark-gray fw-700 fs-19 mb-25px position-relative pb-15px" style="border-bottom:2px solid ${SITE.prune};">Sélection de la rédaction</h3>
                                    <ul class="list-unstyled mb-0">
${picks.map(sidebarPickItem).join('\n')}
                                    </ul>
                                </div>
                                <div>
                                    <h3 class="alt-font text-dark-gray fw-700 fs-19 mb-25px position-relative pb-15px" style="border-bottom:2px solid ${SITE.prune};">Explorer les catégories</h3>
${data.tags.map(sidebarCategoryTile).join('\n')}
                                </div>
                            </div>
                        </div>`;
}

// ---- Pagination ----
const PAGE_SIZE = 12;
function paginate(items, pageSize = PAGE_SIZE) {
  const pages = [];
  for (let i = 0; i < items.length; i += pageSize) pages.push(items.slice(i, i + pageSize));
  return pages.length ? pages : [[]];
}
// basePath: e.g. "" for homepage (-> page-2, page-3) or "categorie-droit" (-> categorie-droit-2, ...)
function paginationNav(basePath, pageNum, totalPages) {
  if (totalPages <= 1) return '';
  const urlFor = n => n === 1 ? (basePath || 'index') : `${basePath || 'page'}-${n}`;
  const prev = pageNum > 1 ? `<a href="${urlFor(pageNum - 1)}.html" class="btn btn-transparent-dark-gray border-2 btn-rounded btn-small text-uppercase fw-700">← Articles précédents</a>` : '';
  const next = pageNum < totalPages ? `<a href="${urlFor(pageNum + 1)}.html" class="btn btn-dark-gray btn-rounded btn-small text-uppercase fw-700">Articles suivants →</a>` : '';
  return `
            <section class="pt-0">
                <div class="container">
                    <div class="row justify-content-center align-items-center" style="gap:15px;">
                        ${prev}
                        <span class="fs-13 text-uppercase opacity-6">Page ${pageNum} / ${totalPages}</span>
                        ${next}
                    </div>
                </div>
            </section>`;
}

// Émojis pour la grille de catégories de la home — mappés sur les vrais slugs de
// catégories du site (data.tags), pas de catégorie inventée.
const CATEGORY_ICONS = {
  'finance': '💰',
  'education': '🎓',
  'droit': '⚖️',
  'sante-bien-etre': '❤️',
  'lifestyle-famille': '👨‍👩‍👧',
  'voyage-decouverte': '✈️',
  'tech': '📱'
};

// ---- "À essayer en famille" promo block (homepage only) ----
// Standalone interactive tools (games/quizzes) — not Ghost posts, so they're
// curated here by hand. Add an entry to feature a new tool on the homepage.
const TOOLS = [
  {
    href: 'jeu-memory-darija.html',
    navLabel: 'Memory Darija',
    category: 'Éducation',
    type: 'Jeu',
    image: 'images/mamoune-memory-darija.webp',
    imagePosition: '50% 22%', // recadré sur le visage — photo verticale, beaucoup de mur vide en haut
    alt: 'Enfant souriant, illustration du jeu Memory Darija',
    speechBubble: "Maman, comment on dit 'khti' en darija ?",
    title: 'Memory Darija : le jeu pour retenir des mots en famille',
    excerpt: "8 paires à retrouver, un mot darija par carte retournée. Un jeu gratuit à faire à deux, parent et enfant.",
    meta: 'Jeu gratuit · 5 min'
  },
  {
    href: 'quiz-routine-skincare-ado.html',
    navLabel: 'Quiz routine skincare',
    category: 'Santé & Bien-être',
    type: 'Quiz',
    image: 'images/aya-quiz-skincare.webp',
    imagePosition: '50% 20%', // recadré sur le visage
    alt: 'Adolescente souriante, illustration du quiz routine skincare',
    title: 'Quelle routine skincare pour mon ado ?',
    excerpt: "6 questions pour découvrir la routine adaptée à son âge, et recevoir le guide complet gratuit par email.",
    meta: 'Quiz gratuit · 2 min'
  }
];

// Carte "solo" affichée à gauche de la pile ci-dessus (pas de rotation/chevauchement).
const TOOL_VACANCES = {
  href: 'calculateur-vacances-famille.html',
  navLabel: 'Calculateur vacances',
  category: 'Finance',
  type: 'Calculateur',
  image: 'images/calculateur-vacances-famille-cover.webp',
  imagePosition: '50% 18%',
  alt: 'Famille marocaine en vacances devant un hôtel bordé de palmiers',
  speechBubble: "Vacances vs budget : chkoun ghadi yrbeh ?",
  title: 'Combien coûtent vraiment vos vacances en famille ?',
  meta: 'Calculateur gratuit · 2 min'
};

function toolCard(tool) {
  return `
                        <a href="${tool.href}" class="nf-tool-card nf-fade-in">
                            <div class="nf-tool-visual">
                                <img src="${tool.image}" alt="${tool.alt}" loading="lazy" style="object-position:${tool.imagePosition};">
                                <span class="nf-tool-badge">Nouveau</span>
                                <span class="nf-tool-cta" aria-hidden="true"><i class="feather icon-feather-arrow-right"></i></span>
                                ${tool.speechBubble ? `<span class="nf-speech-bubble nf-speech-bubble-lg">${tool.speechBubble}</span>` : ''}
                            </div>
                            <div class="nf-tool-body">
                                <span class="nf-tool-cat">${tool.category}</span>
                                <h3 class="nf-tool-title">${tool.title}</h3>
                                <p class="nf-tool-excerpt">${tool.excerpt}</p>
                                <span class="nf-tool-meta">${tool.meta}</span>
                            </div>
                        </a>`;
}

// Bloc vertical (liste compacte) — utilisé pour le regroupement "À essayer en famille" en
// colonne de droite sur la home. Carte plus compacte que nf-tool-card, pensée pour s'empiler.
function toolCardVertical(tool, i) {
  return `
                                <a href="${tool.href}" class="nf-game-row nf-fade-in" style="transition-delay:${i * 90}ms">
                                    <div class="nf-game-thumb">
                                        <img src="${tool.image}" alt="${tool.alt}" loading="lazy" style="object-position:${tool.imagePosition};">
                                        <span class="nf-game-badge">Nouveau</span>
                                        ${tool.speechBubble ? `<span class="nf-speech-bubble">${tool.speechBubble}</span>` : ''}
                                    </div>
                                    <div class="nf-game-info">
                                        <span class="nf-tool-cat">${tool.category}</span>
                                        <h3 class="nf-game-title">${tool.title}</h3>
                                        <p class="nf-game-excerpt">${tool.excerpt}</p>
                                        <span class="nf-game-cta">Jouer maintenant <i class="feather icon-feather-arrow-right"></i></span>
                                    </div>
                                </a>`;
}

// Duo de cartes "fancy" décalées/superposées — inspiré Crafto "Fancy Images", adapté en
// version plus affirmée ("virale") pour la vitrine jeux de la home : grandes photos,
// titre incrusté sur l'image, légère rotation qui se redresse au survol.
function toolCardViral(tool, i) {
  return `
                                <a href="${tool.href}" class="nf-viral-card nf-viral-card-${i + 1} nf-fade-in">
                                    <img src="${tool.image}" alt="${tool.alt}" loading="lazy" style="object-position:${tool.imagePosition};">
                                    <span class="nf-game-badge">Nouveau</span>
                                    ${tool.speechBubble ? `<span class="nf-speech-bubble nf-speech-bubble-lg">${tool.speechBubble}</span>` : ''}
                                    <div class="nf-viral-scrim">
                                        <span class="nf-tool-cat" style="color:#fff;">${tool.category}</span>
                                        <h3 class="nf-viral-title">${tool.title}</h3>
                                        <span class="nf-game-cta" style="color:#fff;">${tool.meta} <i class="feather icon-feather-arrow-right"></i></span>
                                    </div>
                                </a>`;
}

function toolCardSolo(tool) {
  return `
                                <a href="${tool.href}" class="nf-viral-solo nf-fade-in">
                                    <img src="${tool.image}" alt="${tool.alt}" loading="lazy" style="object-position:${tool.imagePosition};">
                                    <span class="nf-game-badge">Nouveau</span>
                                    ${tool.speechBubble ? `<span class="nf-speech-bubble nf-speech-bubble-lg">${tool.speechBubble}</span>` : ''}
                                    <div class="nf-viral-scrim">
                                        <span class="nf-tool-cat" style="color:#fff;">${tool.category}</span>
                                        <h3 class="nf-viral-title">${tool.title}</h3>
                                        <span class="nf-game-cta" style="color:#fff;">${tool.meta} <i class="feather icon-feather-arrow-right"></i></span>
                                    </div>
                                </a>`;
}

// Cartes premium (refonte éditoriale "Hero + secondaires") — remplacent la pile
// superposée nf-viral-* sur la home. Même structure, taille et échelle de titre
// différentes selon le rôle de la carte dans la grille.
function toolCardHero(tool) {
  return `
                                <a href="${tool.href}" class="nf-premium-card nf-tools-hero-card nf-fade-in">
                                    <img src="${tool.image}" alt="${tool.alt}" loading="lazy" style="object-position:${tool.imagePosition};">
                                    <div class="nf-premium-badges">
                                        <span class="nf-glass-badge nf-glass-badge-accent">Nouveau</span>
                                        <span class="nf-glass-badge">${tool.type}</span>
                                    </div>
                                    ${tool.speechBubble ? `<span class="nf-speech-bubble nf-speech-bubble-lg">${tool.speechBubble}</span>` : ''}
                                    <div class="nf-premium-scrim">
                                        <span class="nf-tool-cat" style="color:#fff;">${tool.category}</span>
                                        <h3 class="nf-premium-title">${tool.title}</h3>
                                        <span class="nf-premium-cta">${tool.meta} <i class="feather icon-feather-arrow-right"></i></span>
                                    </div>
                                </a>`;
}

function toolCardSecondary(tool) {
  return `
                                <a href="${tool.href}" class="nf-premium-card nf-tools-secondary-card nf-fade-in">
                                    <img src="${tool.image}" alt="${tool.alt}" loading="lazy" style="object-position:${tool.imagePosition};">
                                    <div class="nf-premium-badges">
                                        <span class="nf-glass-badge nf-glass-badge-accent">Nouveau</span>
                                        <span class="nf-glass-badge">${tool.type}</span>
                                    </div>
                                    ${tool.speechBubble ? `<span class="nf-speech-bubble nf-speech-bubble-lg">${tool.speechBubble}</span>` : ''}
                                    <div class="nf-premium-scrim">
                                        <span class="nf-tool-cat" style="color:#fff;">${tool.category}</span>
                                        <h3 class="nf-premium-title">${tool.title}</h3>
                                        <span class="nf-premium-cta">${tool.meta} <i class="feather icon-feather-arrow-right"></i></span>
                                    </div>
                                </a>`;
}

// ---- Homepage ----
function buildIndex(pageNum, totalPages, pageItems) {
  const featured = pageNum === 1 ? allPosts.slice(0, 3) : [];
  const [dominant, ...secondary] = featured;

  const heroTile = (post, isDominant) => {
    const tag = (postTagByPostId.get(post.id) || [])[0];
    const img = imagePath(post.feature_image, false);
    return `
                        <a href="articles/${post.slug}.html" class="d-block position-relative overflow-hidden hero-tile ${isDominant ? 'hero-tile-dominant' : 'hero-tile-secondary'}">
                            <img src="${img}" alt="${post.title}" class="hero-tile-img" />
                            <div class="opacity-full-dark bg-gradient-bottom-dark-transparent"></div>
                            <div class="position-absolute bottom-0 start-0 w-100 p-30px sm-p-20px text-white">
                                ${tag ? `<span class="btn btn-very-small btn-rounded btn-white text-uppercase fw-700 mb-10px d-inline-block">${tag.name}</span>` : ''}
                                <div class="alt-font fw-700 text-white ${isDominant ? 'fs-32 sm-fs-22' : 'fs-18'} ls-minus-1px mb-5px">${post.title}</div>
                                <span class="fs-12 text-uppercase text-white opacity-7">${dateFmt(post.published_at)} &middot; ${readingTime(post)} min de lecture</span>
                            </div>
                        </a>`;
  };

  const heroMarkup = dominant ? `
                    <div class="col-lg-7 hero-dominant-col mb-2 mb-lg-0">
${heroTile(dominant, true)}
                    </div>
                    <div class="col-lg-5 d-flex flex-column hero-secondary-col" style="gap:8px;">
${secondary.map(p => heroTile(p, false)).join('\n')}
                    </div>` : '';

  const cards = pageItems.map(p => articleCard(p, false)).join('\n');

  const categoryLinks = data.tags.map(t => `
                        <a href="categorie-${t.slug}.html" class="nf-cat-card">
                            <span class="nf-cat-icon">${CATEGORY_ICONS[t.slug] || '📚'}</span>
                            <span>${t.name}</span>
                        </a>`).join('\n');

  const toolsSection = pageNum === 1 ? `
            <section class="pt-0" id="nf-tools-section">
                <div class="container">
                    <div class="nf-tools-grid nf-fade-in">
                        <div class="nf-tools-intro">
                            <span class="nf-tool-cat d-block mb-10px">Interactif</span>
                            <h2 class="nf-tools-title">À essayer en famille</h2>
                            <p class="nf-tools-sub">Des jeux, quiz et outils courts, gratuits, à faire à deux — pas juste des articles à lire.</p>
                            <span class="nf-games-hook"><span class="nf-bounce">🎮</span> ${TOOLS.length + 1} outils gratuits, sans inscription</span>
                        </div>
                        <div class="nf-tools-hero-wrap">
${toolCardHero(TOOL_VACANCES)}
                        </div>
                        <div class="nf-tools-secondary">
${TOOLS.map(toolCardSecondary).join('\n')}
                        </div>
                    </div>
                </div>
            </section>` : '';

  const heroSection = pageNum === 1 ? `
            <section class="p-0 top-space-margin overflow-hidden pb-25px">
                <div class="container-fluid p-0">
                    <div class="row g-2">
${heroMarkup}
                    </div>
                </div>
            </section>
${toolsSection}
            <section class="pt-0" id="nf-categories-section">
                <div class="container">
                    <div class="row justify-content-center mb-4">
                        <div class="col-12 text-center">
                            <h2 class="alt-font text-dark-gray fw-700 ls-minus-1px">Nos catégories</h2>
                        </div>
                    </div>
                    <div class="nf-cat-grid">
${categoryLinks}
                    </div>
                </div>
            </section>
            <section class="bg-very-light-gray nf-nl-benefits-section">
                <div class="container">
                    <div class="row align-items-center mb-5 nf-fade-in">
                        <div class="col-lg-5 mb-4 mb-lg-0">
                            <div class="nf-fancy-images">
                                <div class="nf-fancy-img nf-fancy-img-1"><img src="images/content/2026/04/pexels-zakk-w-2150587326-35979213.webp" alt="Escapade en famille au Maroc" loading="lazy"></div>
                                <div class="nf-fancy-img nf-fancy-img-2"><img src="images/content/2026/04/pexels-cottonbro-7118214.webp" alt="Enfant qui apprend à épargner" loading="lazy"></div>
                                <div class="nf-fancy-img nf-fancy-img-3"><img src="images/content/2026/04/pexels-alexandra-matviets-101599139-18416900.webp" alt="Repas familial équilibré" loading="lazy"></div>
                            </div>
                        </div>
                        <div class="col-lg-7">
                            <span class="nf-tool-cat d-block mb-10px">Newsletter</span>
                            <h2 class="alt-font text-dark-gray fw-700 ls-minus-1px mb-15px">Pourquoi s'abonner à la newsletter</h2>
                            <p class="text-dark-gray">Un seul e-mail, chaque vendredi. Ce que vous y trouvez — rien de plus, rien de moins.</p>
                        </div>
                    </div>
                    <div class="row justify-content-center">
                        <div class="col-12">
                            <div class="nf-nl-benefits nf-fade-in">
                                <div class="nf-nl-benefit">
                                    <div class="nf-nl-icon"><i class="feather icon-feather-calendar"></i></div>
                                    <h4>Un rythme, pas un flux</h4>
                                    <p>Chaque vendredi, un seul e-mail — pas de notification permanente à gérer.</p>
                                </div>
                                <div class="nf-nl-benefit">
                                    <div class="nf-nl-icon"><i class="feather icon-feather-check-circle"></i></div>
                                    <h4>Sélectionné, pas généré</h4>
                                    <p>Les articles sont choisis et écrits par la rédaction de Neybras Family, pas agrégés automatiquement.</p>
                                </div>
                                <div class="nf-nl-benefit">
                                    <div class="nf-nl-icon"><i class="feather icon-feather-shield"></i></div>
                                    <h4>Sans spam</h4>
                                    <p>Désinscription en un clic, à tout moment. Votre adresse n'est ni revendue ni partagée.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="row justify-content-center mt-5">
                        <div class="col-auto">
                            <a href="#subscribe-popup" class="popup-with-zoom-anim btn btn-medium btn-rounded" style="background-color:${SITE.prune};color:#fff;">Je m'abonne</a>
                        </div>
                    </div>
                </div>
            </section>` : '';

  const canonicalPath = pageNum === 1 ? '' : `page-${pageNum}`;

  return `${head(pageNum === 1 ? SITE.title : `Derniers articles — page ${pageNum} — ${SITE.title}`, SITE.description, false, canonicalPath)}
${header(false)}
            <h1 class="visually-hidden">Neybras Family — Magazine famille, éducation et vie quotidienne au Maroc</h1>
${heroSection}
            <section class="${pageNum === 1 ? 'pt-0' : 'top-space-margin'}">
                <div class="container">
                    <div class="row justify-content-center mb-2">
                        <div class="col-12 text-center">
                            <h2 class="alt-font text-dark-gray fw-700 ls-minus-1px">Derniers articles</h2>
                        </div>
                    </div>
                    <div class="row">
                        <div class="${pageNum === 1 ? 'col-lg-8' : 'col-12'} px-0">
                            <ul class="blog-side-image blog-wrapper grid ${pageNum === 1 ? 'grid-1col' : 'grid-2col'} xs-grid-1col gutter-double-extra-large">
                                <li class="grid-sizer"></li>
${cards}
                            </ul>
                        </div>${pageNum === 1 ? buildHomeSidebar() : ''}
                    </div>
                </div>
            </section>
${paginationNav('', pageNum, totalPages)}
${footer(false)}`;
}

// ---- Destination grid (catégorie Voyage & Découverte uniquement) ----
// Pattern inspiré des grilles "prime destination" des thèmes voyage premium, recodé nativement
// (aucun import Bootstrap supplémentaire) : photo réelle de l'article + titre en surimpression,
// léger zoom au survol. Pas de prix, pas de disponibilité — uniquement le lieu et l'article associé.
function destinationCard(post) {
  const img = imagePath(post.feature_image, false) || 'https://placehold.co/600x800';
  const tag = (postTagByPostId.get(post.id) || [])[0];
  return `
                        <a href="articles/${post.slug}.html" class="nf-destination-card nf-fade-in">
                            <img src="${img}" alt="${post.title}" loading="lazy">
                            <div class="nf-destination-label">
                                ${tag ? `<span class="nf-dest-tag">${tag.name}</span>` : ''}
                                <span class="nf-dest-title">${post.title}</span>
                            </div>
                        </a>`;
}

function destinationGrid(pageItems) {
  return `
                    <div class="row">
                        <div class="col-12">
                            <div class="nf-destination-grid">
${pageItems.map(destinationCard).join('\n')}
                            </div>
                        </div>
                    </div>`;
}

// ---- Category (tag archive) pages ----
function buildCategoryPage(tag, pageNum, totalPages, pageItems) {
  const isVoyage = tag.slug === 'voyage-decouverte';
  const cards = pageItems.map(p => articleCard(p, false)).join('\n');
  const basePath = `categorie-${tag.slug}`;
  const canonicalPath = pageNum === 1 ? basePath : `${basePath}-${pageNum}`;
  const title = pageNum === 1 ? `${tag.name} — ${SITE.title}` : `${tag.name} — page ${pageNum} — ${SITE.title}`;
  return `${head(title, `Articles ${tag.name} — ${SITE.description}`, false, canonicalPath)}
${header(false)}
            <section class="top-space-margin">
                <div class="container">
                    <div class="row justify-content-center mb-3">
                        <div class="col-lg-8 text-center">
                            <h1 class="alt-font fw-700 text-dark-gray ls-minus-2px">${tag.name}</h1>
                        </div>
                    </div>
                    ${isVoyage ? (pageItems.length ? destinationGrid(pageItems) : `
                    <div class="row"><div class="col-12 text-center">Aucune destination pour le moment.</div></div>`) : `
                    <div class="row">
                        <div class="col-12 px-0">
                            <ul class="blog-side-image blog-wrapper grid grid-2col xs-grid-1col gutter-double-extra-large">
                                <li class="grid-sizer"></li>
${cards || '<li class="text-center">Aucun article pour le moment.</li>'}
                            </ul>
                        </div>
                    </div>`}
                </div>
            </section>
${paginationNav(basePath, pageNum, totalPages)}
${footer(false)}`;
}

// ---- Article page ----
function buildArticlePage(post) {
  const tag = (postTagByPostId.get(post.id) || [])[0];
  const img = imagePath(post.feature_image, true);
  const absImg = post.feature_image
    ? post.feature_image.replace('__GHOST_URL__/content/images/', `${SITE.domain}/images/content/`).replace(/\.(jpe?g|png)$/i, '.webp')
    : `${SITE.domain}/images/favicon.svg`;
  const body = rewriteContent(post.html, true);
  const related = allPosts.filter(p => p.id !== post.id && tag && (postTagByPostId.get(p.id) || []).some(t => t.id === tag.id)).slice(0, 2);
  const relatedHtml = related.map(p => articleCard(p, true)).join('\n');
  const canonicalPath = `articles/${post.slug}`;
  const excerpt = post.custom_excerpt || (post.plaintext || '').slice(0, 160).trim();

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: excerpt,
    image: [absImg],
    datePublished: post.published_at,
    dateModified: post.updated_at || post.published_at,
    author: { '@type': 'Organization', name: 'Neybras Family Magazine' },
    publisher: {
      '@type': 'Organization',
      name: 'Neybras Publishing SARLAU',
      logo: { '@type': 'ImageObject', url: `${SITE.domain}/images/favicon.svg` }
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE.domain}/${canonicalPath}` }
  };
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${SITE.domain}/` },
      ...(tag ? [{ '@type': 'ListItem', position: 2, name: tag.name, item: `${SITE.domain}/categorie-${tag.slug}` }] : []),
      { '@type': 'ListItem', position: tag ? 3 : 2, name: post.title, item: `${SITE.domain}/${canonicalPath}` }
    ]
  };
  const extraHead = `<script type="application/ld+json">${JSON.stringify(articleSchema)}</script>\n        <script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>`;

  return `${head(`${post.title} — ${SITE.title}`, excerpt || SITE.description, true, canonicalPath, extraHead)}
${header(true)}
            <section class="top-space-margin">
                <div class="container">
                    <div class="row justify-content-center">
                        <div class="col-lg-10 text-center">
                            <span class="fs-18 mb-3 d-inline-block">Par <span class="text-dark-gray fw-500">Rédaction Neybras Family</span>${tag ? ` &middot; <a href="../categorie-${tag.slug}.html" class="text-dark-gray fw-500 text-decoration-line-bottom">${tag.name}</a>` : ''} &middot; ${dateFmt(post.published_at)} &middot; ${readingTime(post)} min de lecture</span>
                            <h1 class="alt-font fw-700 text-dark-gray ls-minus-2px mb-0">${post.title}</h1>
                        </div>
                    </div>
                </div>
            </section>
            <section class="py-0 ps-13 pe-13 lg-ps-4 lg-pe-4 sm-px-0">
                <div class="container-fluid">
                    <div class="row justify-content-center">
                        <div class="col-12"><img src="${img}" class="w-100" alt="${post.title}"></div>
                    </div>
                </div>
            </section>
            <section>
                <div class="container">
                    <div class="row justify-content-center">
                        <div class="col-lg-8 last-paragraph-no-margin article-body">
                            ${body}
                        </div>
                    </div>
                </div>
            </section>
            ${related.length ? `<section class="bg-very-light-gray border-radius-6px">
                <div class="container">
                    <div class="row justify-content-center mb-1">
                        <div class="col-12 col-md-8 col-xl-5 text-center">
                            <h2 class="alt-font text-dark-gray fw-700 ls-minus-1px">À lire aussi</h2>
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-12 px-0">
                            <ul class="blog-side-image blog-wrapper grid grid-2col xs-grid-1col gutter-double-extra-large">
                                <li class="grid-sizer"></li>
${relatedHtml}
                            </ul>
                        </div>
                    </div>
                </div>
            </section>` : ''}
${footer(true)}`;
}

// Companies displayed in the "Ils nous font confiance" logo carousel (partenaires page only).
// Château de Chenonceau removed 2026 — a Loire Valley château had no relevance to a Moroccan
// CSP+ family audience; only real, coherent Neybras-family sister brands remain until genuine
// external partners are confirmed.
const PARTNERS = [
  { name: 'Neybras Magazine', logo: 'images/partners/neybras-magazine.png', url: 'https://neybras-magazine.com/' },
  { name: 'Neybras', logo: 'images/partners/neybras.png', url: 'https://neybras.com/' }
];

function partnersCarousel() {
  const logos = PARTNERS.map(p => `
                            <a href="${p.url}" target="_blank" rel="noopener" class="d-inline-flex align-items-center justify-content-center mx-40px" title="${p.name}">
                                <img src="${p.logo}" alt="${p.name}" loading="lazy" style="max-height:56px;max-width:160px;width:auto;object-fit:contain;">
                            </a>`).join('');
  return `
            <section class="bg-very-light-gray pt-8 pb-8">
                <div class="container">
                    <p class="text-uppercase fw-600 text-center fs-13 mb-30px" style="letter-spacing:3px;color:${SITE.prune};">Ils nous font confiance</p>
                    <div class="d-flex flex-nowrap overflow-auto align-items-center justify-content-start justify-content-lg-center" style="gap:10px;">
                        ${logos}
                    </div>
                </div>
            </section>`;
}

// The Partenaires page's Ghost content included a media-kit rate card (per-format
// pricing table) that doesn't belong on a public-facing site; pricing is on request.
function stripPricingTable(html) {
  return html
    .replace(/<p><strong>Formats disponibles<\/strong><\/p>\s*/, '')
    .replace(/<!--kg-card-begin: html-->[\s\S]*?<!--kg-card-end: html-->\s*/, '<p>Tarifs communiqués sur simple demande.</p>');
}

// The À propos page is reduced to a single, clean contact point per request —
// no leftover editorial links from the old Ghost content.
const A_PROPOS_CONTACT_HTML = `<h3>Nous contacter</h3><p>Vous êtes annonceur, partenaire, ou vous souhaitez simplement nous écrire ?</p><p>📧 <a href="mailto:marketing@neybras-magazine.com">marketing@neybras-magazine.com</a></p>`;

// Real, verified numbers only — computed from allPosts/data.tags, never hand-typed,
// so this can't silently drift into a fabricated stat as content grows.
const A_PROPOS_STATS = { articles: allPosts.length, themes: data.tags.length };

// Duo-photo + chiffre clé (pattern "About" recodé nativement, sans Bootstrap additionnel).
// Photos en placeholder identifié tant que le shooting définitif n'est pas disponible.
function aProposIntro() {
  return `
            <section class="pt-0">
                <div class="container">
                    <div class="nf-about-duo nf-fade-in">
                        <div class="nf-about-photos">
                            <div class="nf-about-photo nf-photo-back"><div class="nf-photo-placeholder"><span>Photo à venir</span></div></div>
                            <div class="nf-about-photo nf-photo-front"><div class="nf-photo-placeholder"><span>Photo à venir</span></div></div>
                            <div class="nf-about-stat">
                                <span class="nf-stat-num">${A_PROPOS_STATS.articles}</span>
                                <span class="nf-stat-label">Articles publiés</span>
                            </div>
                        </div>
                        <div class="nf-about-text last-paragraph-no-margin article-body">
                            <h3>Notre mission</h3>
                            <p>Neybras Family est un média indépendant pour les familles marocaines qui veulent avancer sur ce qui compte&nbsp;: argent, éducation, parentalité, bien-être, voyages et intelligence artificielle. Lancé en avril 2026, le site couvre aujourd'hui ${A_PROPOS_STATS.themes} thématiques avec des conseils concrets, sans jargon ni bruit inutile.</p>
                            <p>Le site est piloté par une rédaction resserrée — pas une salle de rédaction de plusieurs dizaines de journalistes. C'est un choix&nbsp;: mieux vaut peu d'articles bien sourcés qu'un flux permanent.</p>
                        </div>
                    </div>
                </div>
            </section>`;
}

// ---- Static page ----
function buildPage(page) {
  let rawHtml = page.html;
  if (page.slug === 'partenaires') rawHtml = stripPricingTable(rawHtml);
  if (page.slug === 'a-propos') rawHtml = A_PROPOS_CONTACT_HTML;
  const body = rewriteContent(rawHtml, false);
  return `${head(`${page.title} — ${SITE.title}`, page.custom_excerpt || SITE.description, false, page.slug)}
${header(false)}
            <section class="top-space-margin">
                <div class="container">
                    <div class="row justify-content-center">
                        <div class="col-lg-8 text-center">
                            <h1 class="alt-font fw-700 text-dark-gray ls-minus-2px">${page.title}</h1>
                        </div>
                    </div>
                </div>
            </section>
${page.slug === 'a-propos' ? aProposIntro() : ''}
            <section class="pt-0">
                <div class="container">
                    <div class="row justify-content-center">
                        <div class="col-lg-8 last-paragraph-no-margin article-body">
                            ${body}
                        </div>
                    </div>
                </div>
            </section>
${page.slug === 'partenaires' ? partnersCarousel() : ''}
${footer(false)}`;
}

// GitHub Pages serves foo.html when foo is requested, so internal links can
// drop the extension for clean URLs — the files on disk stay named *.html.
function stripHtmlExt(html) {
  html = html.replace(/(href="[^"]+?)\.html(#[^"]*)?"/g, '$1$2"');
  // href="index" / href="../index" -> href="/" (root-absolute — safe from any page,
  // unlike href="" which just reloads whatever page it's written on).
  html = html.replace(/href="(?:\.\.\/)?index"/g, 'href="/"');
  return html;
}

function write(filePath, html) {
  fs.writeFileSync(filePath, stripHtmlExt(html));
}

// ---- Write files ----
fs.mkdirSync(path.join(ROOT, 'articles'), { recursive: true });

{
  const indexPages = paginate(allPosts.slice(3));
  indexPages.forEach((pageItems, i) => {
    const pageNum = i + 1;
    const fileName = pageNum === 1 ? 'index.html' : `page-${pageNum}.html`;
    write(path.join(ROOT, fileName), buildIndex(pageNum, indexPages.length, pageItems));
  });
  console.log(`wrote index.html + ${indexPages.length - 1} pagination page(s)`);
}

let categoryPageCount = 0;
for (const tag of data.tags) {
  const posts = allPosts.filter(p => (postTagByPostId.get(p.id) || []).some(t => t.id === tag.id));
  const tagPages = paginate(posts);
  tagPages.forEach((pageItems, i) => {
    const pageNum = i + 1;
    const fileName = pageNum === 1 ? `categorie-${tag.slug}.html` : `categorie-${tag.slug}-${pageNum}.html`;
    write(path.join(ROOT, fileName), buildCategoryPage(tag, pageNum, tagPages.length, pageItems));
    categoryPageCount++;
  });
}
console.log(`wrote ${categoryPageCount} category page file(s) across ${data.tags.length} categories`);

for (const post of allPosts) {
  write(path.join(ROOT, 'articles', `${post.slug}.html`), buildArticlePage(post));
}
console.log(`wrote ${allPosts.length} article pages`);

for (const page of allPages) {
  write(path.join(ROOT, `${page.slug}.html`), buildPage(page));
}
console.log(`wrote ${allPages.length} static pages`);

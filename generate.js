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
  domain: 'https://www.neybras-family.com',
  social: {
    facebook: 'https://web.facebook.com/profile.php?id=61580744324089',
    instagram: 'https://instagram.com/neybrasfamily',
    linkedin: 'https://linkedin.com/company/neybrasfamily/'
  },
  ga: 'G-XXXXXXXXXX' // TODO: replace with a real GA4 measurement ID for neybras-family.com before going live
};

// Vector "N" mark (ivoire/bleu-nuit/bordeaux — the Neybras brand palette), crisp at any size
const LOGO_SVG = `<svg width="38" height="38" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="6" y="6" width="88" height="88" fill="none" stroke="#0F2238" stroke-width="3"/>
    <polygon points="28,24 40,24 40,76 28,76" fill="#0F2238"/>
    <polygon points="60,24 72,24 72,76 60,76" fill="#0F2238"/>
    <polygon points="28,24 40,24 72,76 60,76" fill="#6E2332"/>
</svg>`;

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
  return ghostUrl.replace('__GHOST_URL__/content/images/', `${prefix}images/content/`);
}

const dateFmt = iso => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

// ---- Shared chrome (header / footer) ----
function head(title, description, fromArticlesDir) {
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
        <link rel="shortcut icon" href="${prefix}images/favicon.png">
        <link rel="apple-touch-icon" href="${prefix}images/apple-touch-icon-57x57.png">
        <link rel="apple-touch-icon" sizes="72x72" href="${prefix}images/apple-touch-icon-72x72.png">
        <link rel="apple-touch-icon" sizes="114x114" href="${prefix}images/apple-touch-icon-114x114.png">
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
                                ${LOGO_SVG}
                                <span class="d-inline-block ms-15px lh-14">
                                    <span class="d-block ls-1px" style="font-family:'Fraunces',serif;font-weight:600;font-size:19px;color:#0F2238;">Neybras Family</span>
                                    <span class="d-block fs-11 text-uppercase opacity-6" style="letter-spacing:2px;color:#6E2332;">Magazine</span>
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
  return `
            <footer class="bg-very-light-gray">
                <div class="container position-relative">
                    <div class="footer-bottom pt-6">
                        <div class="row justify-content-center">
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
    </body>
</html>`;
}

// ---- Article card (used on homepage + category pages) ----
function articleCard(post, fromArticlesDir) {
  const tag = (postTagByPostId.get(post.id) || [])[0];
  const img = imagePath(post.feature_image, fromArticlesDir) || 'https://placehold.co/600x415';
  const prefix = fromArticlesDir ? '../' : '';
  const href = `${prefix}articles/${post.slug}.html`;
  const excerpt = post.custom_excerpt || (post.plaintext || '').slice(0, 140).trim() + '…';
  return `
        <li class="grid-item">
            <div class="blog-box d-lg-flex d-block flex-row h-100 overflow-hidden box-shadow-double-large">
                <div class="blog-image w-45 md-w-100 cover-background" style="background-image: url('${img}')">
                    <a href="${href}" class="blog-post-image-overlay"></a>
                </div>
                <div class="blog-content w-55 md-w-100 p-50px bg-white d-flex flex-column justify-content-center align-items-start lg-p-30px last-paragraph-no-margin">
                    ${tag ? `<a href="${prefix}categorie-${tag.slug}.html" class="categories-btn bg-base-color text-white btn-box-shadow text-uppercase fw-600 mb-20px">${tag.name}</a>` : ''}
                    <a href="${href}" class="card-title text-dark-gray mb-15px fw-600 fs-22 alt-font w-95">${post.title}</a>
                    <p>${excerpt}</p>
                    <span class="fs-13 text-uppercase opacity-7 mt-15px d-block">${dateFmt(post.published_at)}</span>
                </div>
            </div>
        </li>`;
}

// ---- Homepage ----
function buildIndex() {
  const featured = allPosts.slice(0, 3);
  const rest = allPosts.slice(3);

  const heroSlides = featured.map(post => {
    const tag = (postTagByPostId.get(post.id) || [])[0];
    const img = imagePath(post.feature_image, false);
    return `
                                        <div class="swiper-slide">
                                            <div class="interactive-banner-style-09 position-relative overflow-hidden">
                                                <img class="w-100" src="${img}" alt="${post.title}" />
                                                <div class="opacity-full-dark bg-gradient-bottom-dark-transparent"></div>
                                                <div class="image-content h-100 w-100 p-10 xl-p-30px sm-pe-15px sm-ps-15px text-center d-flex justify-content-end align-items-end flex-column">
                                                    <div class="w-100">
                                                        ${tag ? `<a href="categorie-${tag.slug}.html" class="btn btn-medium btn-rounded btn-box-shadow btn-white text-uppercase fw-700 ps-15px pe-15px pt-5px pb-5px lh-16 mb-20px">${tag.name}</a>` : ''}
                                                        <div class="alt-font fw-700 sliding-box-title mb-10px w-80 xl-w-100 md-w-90 sm-w-70 xs-w-100 mx-auto"><a href="articles/${post.slug}.html" class="text-white alt-font fw-600 fs-40 lg-fs-24 ls-minus-1px lg-ls-0px">${post.title}</a></div>
                                                        <div class="d-flex justify-content-center align-items-center xs-lh-22">
                                                            <div class="ms-10px me-10px"><span class="fs-13 text-uppercase text-white opacity-7">${dateFmt(post.published_at)}</span></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>`;
  }).join('\n');

  const cards = rest.map(p => articleCard(p, false)).join('\n');

  const categoryLinks = data.tags.map(t => `
                        <div class="col-6 col-md-3 mb-30px text-center">
                            <a href="categorie-${t.slug}.html" class="btn btn-transparent-dark-gray border-2 btn-rounded btn-small text-uppercase fw-700 w-100">${t.name}</a>
                        </div>`).join('\n');

  return `${head(SITE.title, SITE.description, false)}
${header(false)}
            <section class="p-0 top-space-margin overflow-hidden pb-25px">
                <div class="container-fluid p-0">
                    <div class="row align-items-center">
                        <div class="col-12">
                            <div class="swiper magic-cursor base-color" data-slider-options='{ "slidesPerView": 1, "spaceBetween": 25, "loop": true, "autoplay": { "delay": 6000, "disableOnInteraction": false }, "breakpoints": { "992": { "slidesPerView": 3 }, "768": { "slidesPerView": 2 }, "320": { "slidesPerView": 1 } }, "effect": "slide" }'>
                                <div class="swiper-wrapper">
${heroSlides}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            <section class="pt-0">
                <div class="container">
                    <div class="row justify-content-center mb-4">
                        <div class="col-12 text-center">
                            <h2 class="alt-font text-dark-gray fw-700 ls-minus-1px">Nos catégories</h2>
                        </div>
                    </div>
                    <div class="row justify-content-center">
${categoryLinks}
                    </div>
                </div>
            </section>
            <section class="pt-0">
                <div class="container">
                    <div class="row justify-content-center mb-2">
                        <div class="col-12 text-center">
                            <h2 class="alt-font text-dark-gray fw-700 ls-minus-1px">Derniers articles</h2>
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-12 px-0">
                            <ul class="blog-side-image blog-wrapper grid grid-2col xs-grid-1col gutter-double-extra-large">
                                <li class="grid-sizer"></li>
${cards}
                            </ul>
                        </div>
                    </div>
                </div>
            </section>
${footer(false)}`;
}

// ---- Category (tag archive) pages ----
function buildCategoryPage(tag) {
  const posts = allPosts.filter(p => (postTagByPostId.get(p.id) || []).some(t => t.id === tag.id));
  const cards = posts.map(p => articleCard(p, false)).join('\n');
  return `${head(`${tag.name} — ${SITE.title}`, `Articles ${tag.name} — ${SITE.description}`, false)}
${header(false)}
            <section class="top-space-margin">
                <div class="container">
                    <div class="row justify-content-center mb-3">
                        <div class="col-lg-8 text-center">
                            <h1 class="alt-font fw-700 text-dark-gray ls-minus-2px">${tag.name}</h1>
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-12 px-0">
                            <ul class="blog-side-image blog-wrapper grid grid-2col xs-grid-1col gutter-double-extra-large">
                                <li class="grid-sizer"></li>
${cards || '<li class="text-center">Aucun article pour le moment.</li>'}
                            </ul>
                        </div>
                    </div>
                </div>
            </section>
${footer(false)}`;
}

// ---- Article page ----
function buildArticlePage(post) {
  const tag = (postTagByPostId.get(post.id) || [])[0];
  const img = imagePath(post.feature_image, true);
  const body = rewriteContent(post.html, true);
  const related = allPosts.filter(p => p.id !== post.id && tag && (postTagByPostId.get(p.id) || []).some(t => t.id === tag.id)).slice(0, 2);
  const relatedHtml = related.map(p => articleCard(p, true)).join('\n');
  return `${head(`${post.title} — ${SITE.title}`, post.custom_excerpt || SITE.description, true)}
${header(true)}
            <section class="top-space-margin">
                <div class="container">
                    <div class="row justify-content-center">
                        <div class="col-lg-10 text-center">
                            <span class="fs-18 mb-3 d-inline-block">Par <span class="text-dark-gray fw-500">Rédaction Neybras Family</span>${tag ? ` &middot; <a href="../categorie-${tag.slug}.html" class="text-dark-gray fw-500 text-decoration-line-bottom">${tag.name}</a>` : ''} &middot; ${dateFmt(post.published_at)}</span>
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

// Companies displayed in the "Ils nous font confiance" logo carousel (partenaires page only)
const PARTNERS = [
  { name: 'Château de Chenonceau', logo: 'images/partners/chenonceau.png', url: 'https://www.chenonceau.com/' },
  { name: 'Neybras Magazine', logo: 'images/partners/neybras-magazine.png', url: 'https://neybras-magazine.com/' },
  { name: 'Neybras', logo: 'images/partners/neybras.png', url: 'https://neybras.com/' }
];

function partnersCarousel() {
  const logos = PARTNERS.map(p => `
                            <a href="${p.url}" target="_blank" rel="noopener" class="d-inline-flex align-items-center justify-content-center mx-40px" title="${p.name}">
                                <img src="${p.logo}" alt="${p.name}" style="max-height:56px;max-width:160px;width:auto;object-fit:contain;">
                            </a>`).join('');
  return `
            <section class="bg-very-light-gray pt-8 pb-8">
                <div class="container">
                    <p class="text-uppercase fw-600 text-center fs-13 mb-30px" style="letter-spacing:3px;color:#6E2332;">Ils nous font confiance</p>
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

// ---- Static page ----
function buildPage(page) {
  const rawHtml = page.slug === 'partenaires' ? stripPricingTable(page.html) : page.html;
  const body = rewriteContent(rawHtml, false);
  return `${head(`${page.title} — ${SITE.title}`, page.custom_excerpt || SITE.description, false)}
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

// ---- Write files ----
fs.mkdirSync(path.join(ROOT, 'articles'), { recursive: true });

fs.writeFileSync(path.join(ROOT, 'index.html'), buildIndex());
console.log('wrote index.html');

for (const tag of data.tags) {
  fs.writeFileSync(path.join(ROOT, `categorie-${tag.slug}.html`), buildCategoryPage(tag));
}
console.log(`wrote ${data.tags.length} category pages`);

for (const post of allPosts) {
  fs.writeFileSync(path.join(ROOT, 'articles', `${post.slug}.html`), buildArticlePage(post));
}
console.log(`wrote ${allPosts.length} article pages`);

for (const page of allPages) {
  fs.writeFileSync(path.join(ROOT, `${page.slug}.html`), buildPage(page));
}
console.log(`wrote ${allPages.length} static pages`);

/**
 * Candor: The Open Feed Network
 * Bilingual Language System — English / Spanish (es-419 Latin American)
 *
 * Priority order:
 * 1. localStorage (user explicitly chose a language)
 * 2. CF-IPCountry header (Cloudflare geolocation)
 * 3. navigator.language (browser preference)
 * 4. Default: English
 *
 * Brand names NEVER translate:
 * Candor, Candor Reach, Candor Beacon, Candor ThreatShield,
 * Candor Gateway, Candor Shield, Candor Sentinel, IPFS, API, GitHub
 */

const TRANSLATIONS = {
  en: {
    // Nav
    nav_platform:     "Platform",
    nav_the_platform: "The Platform",
    nav_mission:      "Our Mission",
    nav_compliance:   "Compliance",
    nav_support:      "SUPPORT US →",
    nav_lang_toggle:  "ES",

    // Compliance badges
    badge_coppa:    "COPPA · Candor Gateway active",
    badge_kosa:     "KOSA · Candor Gateway + Candor Reach",
    badge_gdpr:     "GDPR-K · Zero-knowledge age verification",
    badge_ncmec:    "NCMEC · CyberTipline integrated",
    badge_230:      "Section 230 · Truth Shield verified",

    // Hero
    hero_badge:     "LAUNCHING JULY 4TH, 2026",
    hero_h1:        "Your voice.<br><span class=\"accent\">Protected.</span>",
    hero_h2:        "Forever.",
    hero_sub:       "The open-source platform that cannot silence you. Every moderation decision is public, permanent, and auditable on the blockchain. The community governs the algorithm. Free expression with a conscience.",
    btn_support:    "SUPPORT THE MISSION →",
    btn_source:     "VIEW SOURCE CODE",

    // Stat strip
    stat_apis:      "COMMERCIAL APIS",
    stat_files:     "OPEN SOURCE FILES",
    stat_posts:     "SUPPRESSED POSTS",
    stat_audit:     "AUDIT TRAIL (IPFS)",
    stat_governed:  "COMMUNITY GOVERNED",

    // Products section
    products_label: "THE OPEN SHIELD SUITE",
    products_title: "Five products.<br>One mission.",
    products_body:  "We built the content safety infrastructure that every platform needs — and made it available as commercial APIs. Every tool we use to protect our own community is available to protect yours.",

    // Product cards
    p1_tag:   "PLATFORM",
    p1_name:  "Open Feed Platform",
    p1_desc:  "Anti-suppression social media. suppress_post is hardcoded to false — no administrator can hide your content. Every moderation decision is stored on IPFS and auditable forever. The community votes on algorithm parameters.",
    p1_price: "FREE · OPEN SOURCE",

    p2_tag:   "DISINFORMATION",
    p2_name:  "Candor Shield",
    p2_desc:  "AI-powered disinformation detection for newsrooms and fact-checkers. Every verdict stored on IPFS — publicly auditable. Distinguishes disinformation from satire, opinion, and contested claims.",
    p2_price: "FROM $29/MONTH",

    p3_tag:   "CHILD PROTECTION",
    p3_name:  "Candor Gateway",
    p3_desc:  "7-layer child protection for COPPA, KOSA, and GDPR-K compliance. Zero-knowledge age verification — proves age without collecting any personally identifiable information.",
    p3_price: "FROM $79.99/MONTH",

    p4_tag:   "MENTAL HEALTH",
    p4_name:  "Candor Reach",
    p4_desc:  "Mental health crisis detection built from lived experience. Reaches out with warmth. Never suppresses a voice in pain. Connects people in crisis to real human support.",
    p4_price: "FROM $99/MONTH",

    p5_tag:   "FIRST RESPONDERS",
    p5_name:  "Candor Beacon",
    p5_desc:  "Mental health monitoring tuned for police, fire, EMS, dispatch, corrections, and military. Understands gallows humor. Career-safe — never alerts supervisors. Routes only to Peer Support Officers.",
    p5_price: "FROM $99/MONTH",

    p6_tag:   "COUNTER-TERRORISM",
    p6_name:  "Candor ThreatShield",
    p6_desc:  "Four-layer terrorism content detection that protects counter-extremism journalism, academic research, and political speech. Confirmed matches trigger automatic FBI IC3 reporting protocol. No human decision required. No delay. No liability gap.",
    p6_price: "FROM $99/MONTH",

    // Quote
    quote_text:   "On my darkest day I just wished for someone to see me, validate my pain, and help me survive another day. That is why we built Candor Reach.",
    quote_source: "— RONNY CRUZ · FOUNDER · CANDOR: THE OPEN FEED NETWORK",

    // For Platforms section
    platforms_label:  "BUILT FOR PLATFORMS",
    platforms_title:  "The safety infrastructure we built for ourselves — <span style=\"color:var(--teal)\">available for every platform</span> that needs it.",
    platforms_body:   "Candor is not just a social platform. It is a content safety company. Every tool we use to protect our own community is available as a commercial API for platforms, newsrooms, governments, and researchers who need the same protection.",
    tile1_title: "Newsrooms",
    tile1_body:  "Candor Shield flags disinformation before it publishes. Every verdict is auditable and defensible.",
    tile2_title: "Education platforms",
    tile2_body:  "Candor Gateway handles COPPA, KOSA, and GDPR-K compliance with zero-knowledge age verification.",
    tile3_title: "Government & public safety",
    tile3_body:  "Candor Beacon monitors first responder mental health. Career-safe. Routes only to Peer Support Officers.",
    tile4_title: "Research institutions",
    tile4_body:  "Candor ThreatShield protects counter-extremism researchers. Study extremism without triggering false flags.",
    btn_contact: "CONTACT PARTNERSHIPS →",
    btn_api:     "VIEW API DOCUMENTATION",

    // Principles
    principles_label: "HOW IT WORKS",
    principles_title: "Built different.<br>By design.",
    p01_num:   "01 · ANTI-SUPPRESSION",
    p01_title: "Content cannot be hidden",
    p01_body:  "suppress_post: false is hardcoded into the platform architecture. No administrator, no algorithm, and no governance vote can change this. Your content reaches your audience. Every time.",
    p02_num:   "02 · BLOCKCHAIN AUDIT",
    p02_title: "Every decision is public",
    p02_body:  "Every moderation decision, every Candor Shield verdict, every governance vote is stored on IPFS and recorded on the Polygon blockchain. Anyone can verify any decision. Forever.",
    p03_num:   "03 · COMMUNITY GOVERNANCE",
    p03_title: "You govern the algorithm",
    p03_body:  "Token holders vote on algorithm parameters. The community sets the rules the algorithm follows — not executives optimizing for ad revenue. Every vote is on-chain and permanent.",
    p04_num:   "04 · ZERO KNOWLEDGE",
    p04_title: "Privacy by architecture",
    p04_body:  "Age verification uses zero-knowledge proofs — we confirm you meet requirements without learning who you are. No PII collected. No data to sell. No surveillance.",
    p05_num:   "05 · DECENTRALIZED STORAGE",
    p05_title: "Content stored forever",
    p05_body:  "All content is stored on IPFS and Arweave — permanent, decentralized, censorship-resistant. No corporation can delete your history.",

    // Compliance section
    compliance_label: "COMPLIANCE",
    compliance_title: "Candor completed every major content safety registration",
    compliance_body:  "We did not build compliance in after the fact. We built it first.",





    launch_title: 'The platform others will aspire to be.',
    cta_sub: 'No venture capital. No ads. No suppression. Ever. Built by one family. Funded by this community.',
    footer_unity: 'United We Stand. 💙',
    btn_collective: 'SUPPORT ON OPEN COLLECTIVE →',
    btn_github_star: 'STAR ON GITHUB ⭐',

    // Footer
    footer_terms:   "Terms",
    footer_privacy: "Privacy",
    footer_security:"Security",
    footer_github:  "GitHub",
    footer_copy:    "© 2026 Open Feed Network, Inc. · candortheopenfeednetwork.com",
  },

  es: {
    // Nav
    nav_platform:     "Plataforma",
    nav_the_platform: "La Plataforma",
    nav_mission:      "Nuestra Misión",
    nav_compliance:   "Cumplimiento",
    nav_support:      "APÓYANOS →",
    nav_lang_toggle:  "EN",

    // Compliance badges
    badge_coppa:    "COPPA · Candor Gateway activo",
    badge_kosa:     "KOSA · Candor Gateway + Candor Reach",
    badge_gdpr:     "GDPR-K · Verificación de edad sin datos personales",
    badge_ncmec:    "NCMEC · CyberTipline integrado",
    badge_230:      "Sección 230 · Verificado por Candor Shield",

    // Hero
    hero_badge:     "LANZAMIENTO 4 DE JULIO, 2026",
    hero_h1:        "Tu voz.<br><span class=\"accent\">Protegida.</span>",
    hero_h2:        "Para siempre.",
    hero_sub:       "La plataforma de código abierto que no puede silenciarte. Cada decisión de moderación es pública, permanente y verificable en la blockchain. La comunidad gobierna el algoritmo. Expresión libre con conciencia.",
    btn_support:    "APOYA LA MISIÓN →",
    btn_source:     "VER CÓDIGO FUENTE",

    // Stat strip
    stat_apis:      "APIs COMERCIALES",
    stat_files:     "ARCHIVOS OPEN SOURCE",
    stat_posts:     "PUBLICACIONES SUPRIMIDAS",
    stat_audit:     "HISTORIAL EN IPFS",
    stat_governed:  "GOBERNADO POR LA COMUNIDAD",

    // Products section
    products_label: "LA SUITE DE PROTECCIÓN",
    products_title: "Cinco productos.<br>Una misión.",
    products_body:  "Construimos la infraestructura de seguridad de contenido que toda plataforma necesita — y la pusimos disponible como APIs comerciales. Cada herramienta que usamos para proteger nuestra comunidad está disponible para proteger la tuya.",

    // Product cards — brand names stay in English
    p1_tag:   "PLATAFORMA",
    p1_name:  "Open Feed Platform",
    p1_desc:  "Redes sociales anti-supresión. suppress_post está programado en false — ningún administrador puede ocultar tu contenido. Cada decisión de moderación se almacena en IPFS y es auditable para siempre. La comunidad vota los parámetros del algoritmo.",
    p1_price: "GRATIS · CÓDIGO ABIERTO",

    p2_tag:   "DESINFORMACIÓN",
    p2_name:  "Candor Shield",
    p2_desc:  "Detección de desinformación con IA para salas de redacción y verificadores de datos. Cada veredicto almacenado en IPFS — públicamente auditable. Distingue desinformación de sátira, opinión y afirmaciones disputadas.",
    p2_price: "DESDE $29/MES",

    p3_tag:   "PROTECCIÓN INFANTIL",
    p3_name:  "Candor Gateway",
    p3_desc:  "Protección infantil de 7 capas para cumplimiento de COPPA, KOSA y GDPR-K. Verificación de edad sin conocimiento cero — confirma la edad sin recopilar información de identificación personal.",
    p3_price: "DESDE $79.99/MES",

    p4_tag:   "SALUD MENTAL",
    p4_name:  "Candor Reach",
    p4_desc:  "Detección de crisis de salud mental construida desde la experiencia vivida. Se acerca con calidez. Nunca suprime una voz en dolor. Conecta a personas en crisis con apoyo humano real.",
    p4_price: "DESDE $99/MES",

    p5_tag:   "PRIMEROS AUXILIADORES",
    p5_name:  "Candor Beacon",
    p5_desc:  "Monitoreo de salud mental diseñado para policías, bomberos, paramédicos, despachadores, correccionales y militares. Entiende el humor negro. Seguro para la carrera — nunca alerta a supervisores. Dirige solo a Oficiales de Apoyo entre Pares.",
    p5_price: "DESDE $99/MES",

    p6_tag:   "CONTRATERRORISMO",
    p6_name:  "Candor ThreatShield",
    p6_desc:  "Detección de contenido terrorista en cuatro capas que protege el periodismo de contraterrorismo, la investigación académica y el discurso político. Las coincidencias confirmadas activan el protocolo de reporte automático al FBI IC3. Sin decisión humana. Sin demora. Sin brecha de responsabilidad.",
    p6_price: "DESDE $99/MES",

    // Quote
    quote_text:   "En mi día más oscuro solo deseaba que alguien me viera, validara mi dolor y me ayudara a sobrevivir un día más. Por eso construimos Candor Reach.",
    quote_source: "— RONNY CRUZ · FUNDADOR · CANDOR: THE OPEN FEED NETWORK",

    // For Platforms section
    platforms_label:  "CONSTRUIDO PARA PLATAFORMAS",
    platforms_title:  "La infraestructura de seguridad que construimos para nosotros — <span style=\"color:var(--teal)\">disponible para toda plataforma</span> que la necesite.",
    platforms_body:   "Candor no es solo una plataforma social. Es una empresa de seguridad de contenido. Cada herramienta que usamos para proteger nuestra comunidad está disponible como API comercial para plataformas, salas de redacción, gobiernos e investigadores.",
    tile1_title: "Salas de redacción",
    tile1_body:  "Candor Shield detecta desinformación antes de publicar. Cada veredicto es auditable y defendible.",
    tile2_title: "Plataformas educativas",
    tile2_body:  "Candor Gateway maneja el cumplimiento de COPPA, KOSA y GDPR-K con verificación de edad sin datos personales.",
    tile3_title: "Gobierno y seguridad pública",
    tile3_body:  "Candor Beacon monitorea la salud mental de los primeros auxiliadores. Seguro para la carrera. Dirige solo a Oficiales de Apoyo entre Pares.",
    tile4_title: "Instituciones de investigación",
    tile4_body:  "Candor ThreatShield protege a los investigadores de contraterrorismo. Estudia el extremismo sin activar falsas alarmas.",
    btn_contact: "CONTACTAR ALIANZAS →",
    btn_api:     "VER DOCUMENTACIÓN API",

    // Principles
    principles_label: "CÓMO FUNCIONA",
    principles_title: "Construido diferente.<br>Por diseño.",
    p01_num:   "01 · ANTI-SUPRESIÓN",
    p01_title: "El contenido no puede ocultarse",
    p01_body:  "suppress_post: false está programado en la arquitectura de la plataforma. Ningún administrador, algoritmo ni voto de gobernanza puede cambiarlo. Tu contenido llega a tu audiencia. Siempre.",
    p02_num:   "02 · AUDITORÍA BLOCKCHAIN",
    p02_title: "Cada decisión es pública",
    p02_body:  "Cada decisión de moderación, cada veredicto de Candor Shield, cada voto de gobernanza se almacena en IPFS y se registra en la blockchain de Polygon. Cualquiera puede verificar cualquier decisión. Para siempre.",
    p03_num:   "03 · GOBERNANZA COMUNITARIA",
    p03_title: "Tú gobiernas el algoritmo",
    p03_body:  "Los poseedores de tokens votan sobre los parámetros del algoritmo. La comunidad establece las reglas que sigue el algoritmo — no ejecutivos que optimizan ingresos publicitarios. Cada voto está en la cadena y es permanente.",
    p04_num:   "04 · CONOCIMIENTO CERO",
    p04_title: "Privacidad por arquitectura",
    p04_body:  "La verificación de edad usa pruebas de conocimiento cero — confirmamos que cumples los requisitos sin saber quién eres. Sin datos personales. Sin datos para vender. Sin vigilancia.",
    p05_num:   "05 · ALMACENAMIENTO DESCENTRALIZADO",
    p05_title: "Contenido almacenado para siempre",
    p05_body:  "Todo el contenido se almacena en IPFS y Arweave — permanente, descentralizado, resistente a la censura. Ninguna corporación puede borrar tu historia.",

    // Compliance section
    compliance_label: "CUMPLIMIENTO",
    compliance_title: "Candor completó todos los registros de seguridad de contenido",
    compliance_body:  "No construimos el cumplimiento después del hecho. Lo construimos primero.",


    p06_num:   '06 · OPEN SOURCE',
    p06_title: 'Every line of code is public',
    p06_body:  'The entire platform — every microservice, every API, every smart contract — is open source on GitHub. Anyone can audit, fork, and verify that we do exactly what we say we do.',
    compliance_title: 'Safety is not an afterthought.<br>It is the architecture.',
    launch_title: 'La plataforma<br><span class=\'accent\'>a la que otros</span><br>aspirarán.',
    p06_num:   '06 · CÓDIGO ABIERTO',
    p06_title: 'Cada línea de código es pública',
    p06_body:  'Toda la plataforma — cada microservicio, cada API, cada contrato inteligente — es de código abierto en GitHub. Cualquiera puede auditar, bifurcar y verificar que hacemos exactamente lo que decimos.',
    compliance_title: 'La seguridad no es una ocurrencia tardía.<br>Es la arquitectura.',
    launch_title: 'La plataforma a la que otros aspirarán.',
    cta_sub: 'Sin capital de riesgo. Sin anuncios. Sin supresión. Jamás. Construido por una familia. Financiado por esta comunidad.',
    footer_unity: 'Unidos de pie. 💙',
    btn_collective: 'APOYA EN OPEN COLLECTIVE →',
    btn_github_star: 'ESTRELLA EN GITHUB ⭐',
    // Footer
    footer_terms:    "Términos",
    footer_privacy:  "Privacidad",
    footer_security: "Seguridad",
    footer_github:   "GitHub",
    footer_copy:     "© 2026 Open Feed Network, Inc. · candortheopenfeednetwork.com",
  }
};

// ── LANGUAGE DETECTION ────────────────────────────────────────────────────────

function detectLanguage() {
  // 1. Check localStorage first — user explicitly chose
  const stored = localStorage.getItem('candor_lang');
  if (stored && ['en', 'es'].includes(stored)) return stored;

  // 2. Check Cloudflare country header via meta tag (set server-side)
  const cfCountry = document.querySelector('meta[name="cf-country"]');
  if (cfCountry) {
    const country = cfCountry.getAttribute('content');
    const spanishCountries = [
      'MX','ES','AR','CO','CL','PE','VE','EC','GT','CU',
      'BO','DO','HN','PY','SV','NI','CR','PA','UY','GQ','PR'
    ];
    if (spanishCountries.includes(country)) return 'es';
  }

  // 3. Check browser language
  const browserLang = navigator.language || navigator.userLanguage || 'en';
  if (browserLang.startsWith('es')) return 'es';

  // 4. Default to English
  return 'en';
}

// ── APPLY TRANSLATIONS ────────────────────────────────────────────────────────

function applyLanguage(lang) {
  const t = TRANSLATIONS[lang];
  if (!t) return;

  // Store preference
  localStorage.setItem('candor_lang', lang);

  // Update html lang attribute
  document.documentElement.lang = lang === 'es' ? 'es-419' : 'en';

  // Helper to set innerHTML safely
  const set = (selector, key) => {
    const el = document.querySelector(selector);
    if (el && t[key] !== undefined) el.innerHTML = t[key];
  };

  const setText = (selector, key) => {
    const el = document.querySelector(selector);
    if (el && t[key] !== undefined) el.textContent = t[key];
  };

  const setAll = (selector, key) => {
    document.querySelectorAll(selector).forEach(el => {
      if (t[key] !== undefined) el.innerHTML = t[key];
    });
  };

  // Nav
  set('[data-i18n="nav_platform"]',     'nav_platform');
  set('[data-i18n="nav_the_platform"]', 'nav_the_platform');
  set('[data-i18n="nav_mission"]',      'nav_mission');
  set('[data-i18n="nav_compliance"]',   'nav_compliance');
  set('[data-i18n="nav_support"]',      'nav_support');
  set('[data-i18n="nav_lang_toggle"]',  'nav_lang_toggle');

  // Compliance badges
  set('[data-i18n="badge_coppa"]',   'badge_coppa');
  set('[data-i18n="badge_kosa"]',    'badge_kosa');
  set('[data-i18n="badge_gdpr"]',    'badge_gdpr');
  set('[data-i18n="badge_ncmec"]',   'badge_ncmec');
  set('[data-i18n="badge_230"]',     'badge_230');

  // Hero
  set('[data-i18n="hero_badge"]',  'hero_badge');
  set('[data-i18n="hero_h1"]',     'hero_h1');
  set('[data-i18n="hero_h2"]',     'hero_h2');
  set('[data-i18n="hero_sub"]',    'hero_sub');
  set('[data-i18n="btn_support"]', 'btn_support');
  set('[data-i18n="btn_source"]',  'btn_source');

  // Stat strip
  set('[data-i18n="stat_apis"]',     'stat_apis');
  set('[data-i18n="stat_files"]',    'stat_files');
  set('[data-i18n="stat_posts"]',    'stat_posts');
  set('[data-i18n="stat_audit"]',    'stat_audit');
  set('[data-i18n="stat_governed"]', 'stat_governed');

  // Products
  set('[data-i18n="products_label"]', 'products_label');
  set('[data-i18n="products_title"]', 'products_title');
  set('[data-i18n="products_body"]',  'products_body');

  for (let i = 1; i <= 6; i++) {
    set(`[data-i18n="p${i}_tag"]`,   `p${i}_tag`);
    set(`[data-i18n="p${i}_name"]`,  `p${i}_name`);
    set(`[data-i18n="p${i}_desc"]`,  `p${i}_desc`);
    set(`[data-i18n="p${i}_price"]`, `p${i}_price`);
  }

  // Quote
  set('[data-i18n="quote_text"]',   'quote_text');
  set('[data-i18n="quote_source"]', 'quote_source');

  // Platforms section
  set('[data-i18n="platforms_label"]', 'platforms_label');
  set('[data-i18n="platforms_title"]', 'platforms_title');
  set('[data-i18n="platforms_body"]',  'platforms_body');
  set('[data-i18n="tile1_title"]',     'tile1_title');
  set('[data-i18n="tile1_body"]',      'tile1_body');
  set('[data-i18n="tile2_title"]',     'tile2_title');
  set('[data-i18n="tile2_body"]',      'tile2_body');
  set('[data-i18n="tile3_title"]',     'tile3_title');
  set('[data-i18n="tile3_body"]',      'tile3_body');
  set('[data-i18n="tile4_title"]',     'tile4_title');
  set('[data-i18n="tile4_body"]',      'tile4_body');
  set('[data-i18n="btn_contact"]',     'btn_contact');
  set('[data-i18n="btn_api"]',         'btn_api');

  // Principles
  set('[data-i18n="principles_label"]', 'principles_label');
  set('[data-i18n="principles_title"]', 'principles_title');
  for (let i = 1; i <= 5; i++) {
    const num = String(i).padStart(2,'0');
    set(`[data-i18n="p${num}_num"]`,   `p${num}_num`);
    set(`[data-i18n="p${num}_title"]`, `p${num}_title`);
    set(`[data-i18n="p${num}_body"]`,  `p${num}_body`);
  }

  // Compliance section
  set('[data-i18n="compliance_label"]', 'compliance_label');
  set('[data-i18n="compliance_title"]', 'compliance_title');
  set('[data-i18n="compliance_body"]',  'compliance_body');

  // Footer
  set('[data-i18n="footer_terms"]',    'footer_terms');
  set('[data-i18n="footer_privacy"]',  'footer_privacy');
  set('[data-i18n="footer_security"]', 'footer_security');
  set('[data-i18n="footer_github"]',   'footer_github');
  set('[data-i18n="footer_copy"]',     'footer_copy');

  // Update toggle button appearance
  const toggle = document.getElementById('lang-toggle');
  if (toggle) {
    toggle.textContent = lang === 'es' ? 'EN' : 'ES';
    toggle.setAttribute('aria-label', lang === 'es' ? 'Switch to English' : 'Cambiar a Español');
  }
}

// ── TOGGLE ────────────────────────────────────────────────────────────────────

function toggleLanguage() {
  const current = localStorage.getItem('candor_lang') || detectLanguage();
  const next = current === 'en' ? 'es' : 'en';
  applyLanguage(next);
}

// ── INIT ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
  const lang = detectLanguage();
  applyLanguage(lang);
});

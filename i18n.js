// EN is authored in the HTML; TR replaces [data-i18n] text before the film
// splits words. ?lang=tr|en wins, then the saved choice (storage may be blocked).
const TR = {
  skip: 'İşlere geç', navWork: 'İşler', navContact: 'İletişim',
  eye0: 'Portfolyo · 2026', title0: 'Film gibi oynayan web siteleri.',
  body0: 'Ben Resul Çetin. Kaydırmayla oynayan sinematik web deneyimleri ve Stellar ile Midnight üzerinde gizlilik öncelikli uygulamalar geliştiriyorum.',
  scroll: 'Kamerayı çalıştırmak için kaydır ↓',
  eye1: 'Yöntem', title1: 'Kaydırma, oynatma kafası.',
  body1: 'Tek, kesintisiz bir 3D çekim. Kamera hareket eder, dünya değişir, hikâye sen kaydırdıkça açılır. Hiçbir şey sadece sırayla gelmez.',
  eye2: 'Öne çıkan · Scroll Cinema ile çekildi', live: 'Canlı siteyi aç', code: 'Kaynak kod',
  eye3: 'Seçili işler', hint: 'Makarayı çevirmek için kaydır · önizleme için üzerine gel',
  eye4: 'Sonraki sahne', title4: 'Sıradaki film seninki olsun.', github: "GitHub'da takip et",
  credit: 'Scroll Cinema ile yapıldı — Three.js, GSAP, Lenis ve Blender.',
  loading: 'Film yükleniyor',
};
export const LABELS = {
  en: ['Opening', 'The method', 'Featured', 'Selected work', 'Contact'],
  tr: ['Açılış', 'Yöntem', 'Öne çıkan', 'Seçili işler', 'İletişim'],
};

let locale = 'en';
try { if (localStorage.getItem('portfolio.locale') === 'tr') locale = 'tr'; } catch {}
const asked = new URLSearchParams(location.search).get('lang');
if (asked === 'en' || asked === 'tr') {
  locale = asked;
  try { localStorage.setItem('portfolio.locale', locale); } catch {}
}
export const lang = locale;
window.portfolioLocale = locale;
document.documentElement.lang = locale;

if (locale === 'tr') {
  document.querySelectorAll('[data-i18n]').forEach((el) => { if (TR[el.dataset.i18n]) el.textContent = TR[el.dataset.i18n]; });
  document.title = 'Resul Çetin — Film gibi oynayan web siteleri';
  document.querySelector('[data-hud-label]').textContent = LABELS.tr[0];
}
document.querySelectorAll('[data-locale]').forEach((b) => {
  b.setAttribute('aria-pressed', String(b.dataset.locale === locale));
  b.addEventListener('click', () => {
    if (b.dataset.locale === locale) return;
    try { localStorage.setItem('portfolio.locale', b.dataset.locale); } catch {}
    const url = new URL(location.href);
    url.searchParams.set('lang', b.dataset.locale);
    location.assign(url);
  });
});

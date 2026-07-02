# Neredesin Co?

Statik kişisel site + markdown blog. Build adımı yok; dosyalar doğrudan
tarayıcıda render edilir. Bağımlılıklar sürüm sabitlenmiş CDN modülleri
olarak yüklenir, depoda `node_modules` yoktur.

**Canlı:** https://yankikucuk.github.io/neredesin.co/

## Özellikler

- **Markdown blog** — `posts/` altındaki `.md` dosyaları istemci tarafında
  render edilir (marked 18 + DOMPurify ile XSS'e karşı sanitize).
- **Sözdizimi renklendirme** — One Dark Pro paleti, highlight.js core +
  seçili 11 dil (tam paket yerine ~%95 daha küçük yük).
- **Arama & etiketler** — istemci tarafı tam metin arama ve etiket filtresi.
- **Özet + tekil yazı görünümü** — listede ilk paragraf ve okuma süresi;
  `blog.html#yazi-slug` hash rotası ile tekil sayfa.
- **Tema anahtarı** — sistem tercihini izler, nav'daki düğme ile manuel
  geçiş yapılır ve `localStorage`'da kalıcıdır (FOUC yok).
- **Ses oynatıcı** — `@audio:` direktifi; klavye ile sarma, hata durumu
  bildirimi, `preload="none"`.
- **Çok dillilik** — `en/` altında İngilizce sürüm, `hreflang`
  alternatifleri ile.
- **Offline / PWA** — service worker (network-first içerik, cache-first
  CDN), manifest + ikon seti.
- **RSS** — Atom formatında [feed.xml](feed.xml), `tools/generate.py` üretir.
- **SEO** — canonical, Open Graph + Twitter Card + og-image, JSON-LD
  (Person / WebSite / Blog), sitemap, robots.txt.
- **Güvenlik** — tüm sayfalarda Content-Security-Policy, sanitize edilmiş
  render, sürüm sabitli bağımlılıklar.
- **Erişilebilirlik** — skip-link, ARIA'lı oynatıcı/düğmeler, tek `h1` +
  otomatik başlık indirgeme, `prefers-reduced-motion` desteği.

## Çalıştırma

```bash
python3 serve.py 8080        # veya: npm run serve
```

`serve.py`, standart `http.server`'ın üzerine tek davranış ekler:
eşleşmeyen yollar için `404.html` döner (GitHub Pages'in yaptığı gibi).

## Proje Yapısı

```
index.html            Landing page (hero + hakkımda + sosyal linkler)
blog.html             Blog: liste + tekil yazı görünümü (hash rotası)
portfolio.html        Portföy kartları
404.html              Özel hata sayfası
en/                   İngilizce sayfa sürümleri
style.css             Tek stylesheet (tasarım tokenları + tema blokları)
script.js             Blog motoru (ES module)
site.js               Tema, service worker kaydı, analitik (tüm sayfalar)
sw.js                 Service worker (offline önbellekleme)
lib/utils.js          Saf yardımcı fonksiyonlar (test edilebilir)
tests/                Birim testleri (node --test)
tools/generate.py     İçerik hattı: feed + sitemap + cache-bust damgası
posts/                Yazılar (.md) + index.json (sıralama)
sounds/               Ses dosyaları
assets-src/           Marka görsellerinin SVG kaynakları
```

## Yeni Blog Yazısı Ekleme

1. `posts/` içine bir `.md` dosyası ekle:

   ```markdown
   ---
   title: Yazı Başlığı
   date: 2026-07-02
   tags: javascript, notlar
   ---

   İlk paragraf listede özet olarak görünür.

   @audio:sounds/dosya.mp3
   ```

2. Dosya adını `posts/index.json` dizisine ekle (en yeni en başta).
3. Üretilen dosyaları tazele ve testleri koştur:

   ```bash
   npm run generate   # feed.xml, sitemap.xml, ?v= damgaları
   npm test
   ```

4. Commit + push — GitHub Pages ~1 dakika içinde yayınlar.

Yazı, başlığından türetilen slug ile `blog.html#yazi-basligi` adresinden
paylaşılabilir; aynı başlıktan iki yazı varsa `-2`, `-3` eklenir.

## Testler & CI

- `npm test` — `lib/utils.js` saf fonksiyonlarının birim testleri
  (Node'un yerleşik test koşucusu, sıfır bağımlılık).
- `.github/workflows/ci.yml` — her push/PR'da: testler, Prettier format
  kontrolü ve `tools/generate.py --check` (üretilen dosyalar bayatsa CI
  kırmızı olur).

## Analitik (isteğe bağlı, çerezsiz)

[GoatCounter](https://www.goatcounter.com) entegrasyonu hazır ama
**kapalı**. Açmak için:

1. goatcounter.com'da ücretsiz bir site kodu al (örn. `neredesin`).
2. `site.js` içindeki `GOATCOUNTER_CODE` değerine yaz.
3. `npm run generate` + commit + push.

Kod boş kaldığı sürece hiçbir istek gönderilmez.

## Tema

Site varsayılan olarak `prefers-color-scheme`'i izler. Nav'daki düğme
`<html data-theme="light|dark">` özniteliğini yazar ve `localStorage`'a
kaydeder; `site.js` bunu ilk boyamadan önce uygular. CSS'te koyu tema
tokenları iki blokta bilinçli olarak tekrarlanır (media query + öznitelik)
— build adımı olmayan projede en sağlam kalıp budur.

## Marka Görsellerini Yeniden Üretme

`assets-src/` altındaki SVG'ler kaynaktır; PNG'leri yeniden üretmek için
(macOS, ek araç gerekmez):

```bash
sips -s format png assets-src/og-image.svg --out og-image.png
sips -s format png assets-src/icon-mark.svg --out icon-512.png
sips -z 192 192 -s format png assets-src/icon-mark.svg --out icon-192.png
sips -s format png assets-src/apple-touch-icon.svg --out apple-touch-icon.png
sips -z 32 32 -s format png favicon.svg --out favicon-32.png
```

## Yayın

`main` dalına her push, GitHub Pages tarafından otomatik yayınlanır
("Deploy from a branch" → `main` / kök). `tools/generate.py`'nin bastığı
`?v=<hash>` sorgu parametreleri, CSS/JS değiştiğinde tarayıcı ve CDN
önbelleklerinin eski sürümü göstermesini engeller; service worker da aynı
hash ile sürümlenir ve eski önbelleklerini kendisi temizler.

### Custom Domain'e Taşıma

1. Alan adını satın al ve DNS'te `www` için `yankikucuk.github.io`'ya
   CNAME kaydı (apex için 185.199.108-111.153 A kayıtları) ekle.
2. Repo → Settings → Pages → Custom domain alanına alan adını yaz
   (GitHub `CNAME` dosyasını otomatik oluşturur) ve "Enforce HTTPS"i aç.
3. `tools/generate.py` içindeki `SITE` sabitini ve HTML'lerdeki mutlak
   URL'leri (canonical, og:url, hreflang, JSON-LD) yeni alan adıyla
   değiştir; `npm run generate` çalıştır.

## Yayına Almadan Önce

- [ ] Sosyal medya linklerini (`href="#"`) ve `mailto:ornek@mail.com`
      adresini gerçek değerlerle güncelle (`index.html` + `en/index.html`).
- [ ] Portföy kartlarındaki proje linklerini gerçek URL'lerle değiştir.

## Lisans

MIT — bkz. [LICENSE](LICENSE).

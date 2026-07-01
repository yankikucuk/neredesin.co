# Neredesin Co?

Sıfır bağımlılıklı, tamamen statik kişisel site + markdown blog. Build adımı yok;
dosyalar doğrudan tarayıcıda render edilir.

## Teknoloji

- Vanilla HTML / CSS / JS (ES modülleri)
- Markdown render: [marked.js](https://marked.js.org) (jsDelivr üzerinden, sabit sürüm)
- Tasarım: glassmorphism, `prefers-color-scheme` ile otomatik açık/koyu tema
- Fontlar: Montserrat + Roboto Mono (Google Fonts)

## Çalıştırma

```bash
python3 serve.py 8080
```

`serve.py`, standart `python3 -m http.server`'ın üzerine tek bir davranış ekler:
eşleşmeyen bir yol istendiğinde `404.html`'i döner. Netlify, Vercel, GitHub Pages
ve Cloudflare Pages bunu zaten kutudan çıkar yapar; bu script sadece yerelde
aynı deneyimi sağlar.

## Proje Yapısı

```
index.html          Landing page (hero + hakkımda + sosyal linkler)
blog.html            Blog listesi (posts/ içeriğini JS ile render eder)
portfolio.html        Portföy / proje kartları
404.html             Özel "sayfa bulunamadı" ekranı
style.css            Tüm sayfalar için tek stylesheet
script.js            Blog motoru: frontmatter parse, markdown render, ses oynatıcı
posts/               Blog yazıları (.md) + index.json (yazı sırası)
sounds/              Yazı içine gömülü ses dosyaları
assets-src/          Marka görsellerinin SVG kaynakları (og-image, ikonlar)
```

## Yeni Blog Yazısı Ekleme

1. `posts/` klasörüne `00N.md` biçiminde bir dosya ekle:
   ```markdown
   ---
   title: Yazı Başlığı
   date: YYYY-MM-DD
   ---

   İçerik buraya. Standart markdown desteklenir.

   @audio:sounds/dosya.mp3
   ```
2. `posts/index.json` dizisine dosya adını ekle (en yeni yazı en başta).
3. Yazı otomatik olarak slug'lanmış bir kimlikle (`#baslik-boyle-olusur`) tekil
   olarak bağlantılanabilir hale gelir.

`@audio:<yol>` satırı, oynat/duraklat, ilerleme çubuğu (mouse + klavye ok
tuşlarıyla) ve süre göstergesi içeren bir ses oynatıcıya dönüştürülür.

## Marka Görsellerini Yeniden Üretme

`assets-src/` altındaki SVG kaynaklar, kök dizindeki PNG'lerin
(og-image.png, icon-192.png, icon-512.png, apple-touch-icon.png,
favicon-32.png) orijinalidir. Metni veya renkleri değiştirdikten sonra
yeniden rasterize etmek için (macOS, ek bağımlılık gerekmez):

```bash
sips -s format png assets-src/og-image.svg --out og-image.png
sips -s format png assets-src/icon-mark.svg --out icon-512.png
sips -z 192 192 -s format png assets-src/icon-mark.svg --out icon-192.png
sips -s format png assets-src/apple-touch-icon.svg --out apple-touch-icon.png
sips -z 32 32 -s format png favicon.svg --out favicon-32.png
```

## Yayın

Site [GitHub Pages](https://pages.github.com) üzerinden yayınlanıyor:
**https://yankikucuk.github.io/neredesin.co/**

`main` dalına yapılan her `git push`, Pages tarafından otomatik olarak
algılanıp yayınlanır (genelde ~1 dakika içinde) — ekstra bir build/deploy
adımı yok. Repo ayarlarında Pages kaynağı "Deploy from a branch" →
`main` / `/ (root)` olarak yapılandırıldı.

Tüm iç linkler göreli (`blog.html`, `index.html` vb.) olduğu için site
hem bu subpath altında hem de ileride bir custom domain veya
`kullaniciadi.github.io` kök adresine taşınsa da değişiklik gerektirmeden
çalışır.

## Yayına Almadan Önce

- [ ] `index.html` içindeki sosyal medya linklerini (`href="#"`) ve
      `mailto:ornek@mail.com` adresini gerçek değerlerle güncelle.
- [ ] Portföy kartlarındaki proje linklerini (`href="#"`) gerçek URL'lerle
      değiştir.
- [ ] İsteğe bağlı: `style.css` / `script.js` dosyalarını bir minifier'dan
      geçir. Proje bilinçli olarak build adımı içermediği için bu depoya
      dahil edilmedi; üretime alırken tek seferlik bir adım olarak uygulanabilir.

## Lisans

MIT — bkz. [LICENSE](LICENSE).

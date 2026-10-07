# BD Notlar

Hızlı, yerel ve çevrimdışı çalışan bir Windows masaüstü not alma uygulaması. Notlarınız yalnızca kendi bilgisayarınızda, bir SQLite veritabanında saklanır.

**Tauri 2** (Rust) + **React** + **TypeScript** ile geliştirilmiştir.

## Özellikler

- **Zengin metin editörü** (TipTap): başlıklar, kalın/italik/üstü çizili, listeler, alıntı ve kod blokları, geri al/yinele
- **5 farklı görünüm**: Liste, Kart, Tablo, Takvim ve Zaman Çizelgesi
- **Akıllı görünümler**: Tüm Notlar, Bugün, Gecikenler, Tamamlanmamış, Tamamlananlar, Sabitlenenler, Favoriler, Arşiv, Çöp Kutusu
- **Kategoriler**, alt görevler ve dosya ekleri
- **Durum ve öncelik takibi**, başlangıç ve bitiş tarihleri
- **Hatırlatıcılar**: Windows Görev Zamanlayıcısı ile entegre, uygulama kapalıyken bile bildirim gönderir
- **Sürükle-bırak** ile sıralama ve kategoriye taşıma
- **Not sabitleme, favoriler, arşivleme** ve geri alınabilir silme (çöp kutusu)
- **Dışa aktarma**: CSV, JSON ve Excel (.xlsx)
- **İçe aktarma / geri yükleme**: JSON ve CSV yedeklerinden
- **Sistem tepsisi** desteği, "Windows ile başlat" seçeneği ve tek örnek (single instance) çalışma
- Koyu ve açık tema
- Her not için ayrı düzenleme penceresi

## Klavye Kısayolları

| Kısayol | İşlev |
| --- | --- |
| `Ctrl + Shift + N` | Hızlı yeni not (global, uygulama arka plandayken de çalışır) |
| `Ctrl + Shift + S` | Ana pencereyi göster / gizle (global) |
| `Ctrl + 1` ... `Ctrl + 5` | Liste, Kart, Tablo, Takvim, Zaman Çizelgesi görünümleri |

## Gereksinimler

- Windows 10 / 11
- [Node.js](https://nodejs.org/) 18 veya üzeri
- [Rust](https://www.rust-lang.org/tools/install) (rustup ile)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) ("Desktop development with C++" iş yükü)
- WebView2 (Windows 11'de hazır gelir)

Ayrıntılar için [Tauri ön gereksinimleri](https://v2.tauri.app/start/prerequisites/) sayfasına bakın.

## Kurulum ve Geliştirme

```bash
git clone https://github.com/<kullanici-adi>/<depo-adi>.git
cd <depo-adi>
npm install
npm run tauri dev
```

İlk çalıştırmada Rust bağımlılıkları derlendiği için birkaç dakika sürebilir.

Yalnızca ön yüzü tarayıcıda görmek isterseniz `npm run dev` komutunu kullanıp `http://localhost:1421` adresini açabilirsiniz. Tauri komutları tarayıcıda çalışmadığından bu modda notlar kaydedilmez.

## Derleme (Kurulum Paketi)

```bash
npm run tauri build
```

Kurulum dosyaları `src-tauri/target/release/bundle/` altında oluşur (NSIS `.exe` ve `.msi`).

## Veri Konumu

Notlar `%APPDATA%\smart-notes\smart_notes.db` dosyasında saklanır. Yedek almak için bu dosyayı kopyalayabilir veya uygulamadaki **JSON yedek** özelliğini kullanabilirsiniz.

## Proje Yapısı

```
├── src/                     # React ön yüzü
│   ├── app/                 # Ana uygulama ve kenar çubuğu
│   ├── features/
│   │   ├── editor/          # Not editörü
│   │   └── views/           # Liste, Kart, Tablo, Takvim, Zaman Çizelgesi
│   └── store/               # Zustand durum yönetimi
├── src-tauri/               # Rust arka yüzü
│   ├── src/main.rs          # Komutlar, veritabanı, hatırlatıcılar, tepsi
│   ├── capabilities/        # Tauri izinleri
│   └── tauri.conf.json      # Uygulama yapılandırması
└── package.json
```

## Teknolojiler

- [Tauri 2](https://tauri.app/), Rust, [rusqlite](https://github.com/rusqlite/rusqlite) (SQLite)
- [React 18](https://react.dev/), TypeScript, [Vite](https://vitejs.dev/)
- [Tailwind CSS](https://tailwindcss.com/), [Zustand](https://github.com/pmndrs/zustand), [TipTap](https://tiptap.dev/), [Lucide](https://lucide.dev/)

## Bilinen Sınırlamalar

- Hatırlatıcılar Windows Görev Zamanlayıcısı'na (`schtasks`) dayandığı için yalnızca Windows'ta tam çalışır.

## Lisans

Henüz bir lisans belirlenmemiştir. Depoyu herkese açık yayınlamadan önce bir lisans seçip `LICENSE` dosyası eklemenizi öneririm (ör. MIT).

---

© 2026 BD Studio

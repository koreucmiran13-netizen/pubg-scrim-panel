# PUBG Scrim Panel

WhatsApp botundan bağımsız, port 3001'de çalışan profesyonel PUBG Mobile scrim yönetim paneli.

## Özellikler

- **24 takım slot tablosu** — maç sonuçları otomatik sıralanır
- **Screenshot OCR** — Google Gemini Vision ile maç sonuç ekran görüntülerini okur
- **Birden fazla screenshot** — bir seferde 10'a kadar screenshot yükle, hepsi tek sonuç tablosuna işlenir
- **Manuel sonuç girişi** — OCR çalışmazsa elle de ekleyebilirsin
- **Puan hesaplama** — kill + placement otomatik hesaplanır
- **Admin paneli** — şifreli giriş, sadece sana özel
- **Takım yönetimi** — kayıtlı takımları ekle/sil
- **Ayarlar** — kill puanı, placement puanları, slot sayısı özelleştirilebilir

## Kurulum

```bash
# 1. Repo'yu klonla
cd /home
git clone https://github.com/koreucmiran13-netizen/pubg-scrim-panel.git pubgpanel
cd pubgpanel

# 2. .env dosyasını düzenle
cp .env.example .env
nano .env

# 3. Kurulum scriptini çalıştır
bash install.sh
```

## .env Ayarları

| Değişken | Açıklama | Varsayılan |
|----------|----------|------------|
| `ADMIN_PASSWORD` | Admin panel şifresi | `miranadmin2024` |
| `GEMINI_API_KEY` | Google AI Studio API key (OCR için) | Boş (OCR devre dışı) |
| `GEMINI_MODEL` | Gemini model | `gemini-2.5-flash` |
| `PORT` | Dinlenecek port | `3001` |

## Kullanım

1. `http://VDS_IP:3001` adresine git
2. Admin şifresi ile giriş yap
3. "+ Yeni Maç" ile maç oluştur
4. Maçın içine gir, screenshot'ları yükle
5. AI otomatik okur ve sonuç tablosuna ekler
6. Manuel ekleme veya düzenleme de yapabilirsin

## PM2 Komutları

```bash
pm2 status          # Durum kontrolü
pm2 logs pubg-panel # Log görüntüle
pm2 restart pubg-panel  # Yeniden başlat
pm2 stop pubg-panel     # Durdur
```

## Not

- WhatsApp botu (port 3000) ile çakışma yok
- Web siten farklı portta çalışıyorsa ona da dokunulmaz
- `data.json` dosyasında tüm veriler saklanır (silme!)

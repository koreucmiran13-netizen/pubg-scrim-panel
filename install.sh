#!/bin/bash
# PUBG Scrim Panel — VDS Kurulum Scripti
# Port 3001'de çalışır, WhatsApp botunu (3000) etkilemez

echo "============================================"
echo "  PUBG Scrim Panel — Kurulum"
echo "============================================"

# Klasöre git
cd /home/pubgpanel 2>/dev/null || { echo "Hata: /home/pubgpanel bulunamadı"; exit 1; }

# npm install
echo "[1/4] Bağımlılıklar kuruluyor..."
npm install --legacy-peer-deps
if [ $? -ne 0 ]; then echo "npm install başarısız!"; exit 1; fi

# PM2 kontrol
if ! command -v pm2 &> /dev/null; then
    echo "[2/4] PM2 kuruluyor..."
    npm install -g pm2
else
    echo "[2/4] PM2 zaten kurulu"
fi

# .env kontrolü
if [ ! -f .env ]; then
    echo "[3/4] .env dosyası oluşturuluyor..."
    cp .env.example .env
    echo ""
    echo "⚠️  ÖNEMLİ: .env dosyasını düzenleyin!"
    echo "    GEMINI_API_KEY ve ADMIN_PASSWORD değerlerini girin:"
    echo "    nano /home/pubgpanel/.env"
    echo ""
fi

# PM2 ile başlat
echo "[4/4] PM2 ile başlatılıyor..."
pm2 delete pubg-panel 2>/dev/null
pm2 start "node server.js" --name "pubg-panel" --cwd "/home/pubgpanel"
pm2 save
pm2 startup

echo ""
echo "============================================"
echo "  ✅ Kurulum tamamlandı!"
echo "  Panel: http://$(hostname -I | awk '{print $1}'):3001"
echo "  PM2: pm2 status (pubg-panel)"
echo "============================================"
echo ""
echo "NOT: .env dosyasına GEMINI_API_KEY eklemeyi unutma!"
echo "     nano /home/pubgpanel/.env"
echo ""

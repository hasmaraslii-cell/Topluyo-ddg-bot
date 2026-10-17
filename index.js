const WebSocket = require('ws');
const axios = require('axios');
const cheerio = require('cheerio');

// Token, Render Environment Variables (CLIENT_KEY) üzerinden çekilir.
const CLIENT_KEY = process.env.CLIENT_KEY;
const DAVET_LINKI = "https://topluyo.com/"; // Kendi sunucu/davet linkinizle değiştirin

if (!CLIENT_KEY) {
  console.error("HATA: CLIENT_KEY çevresel değişkeni bulunamadı! Lütfen Render panelinde tanımlayın.");
  process.exit(1);
}

// --- DUCKDUCKGO ARAMA FONKSİYONU ---
async function duckDuckGoAra(query) {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=tr-tr`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const results = [];

    $('.result').each((i, element) => {
      if (i >= 5) return false; // En fazla 5 sonuç getir
      const a = $(element).find('.result__a');
      if (!a.length) return;

      let link = a.attr('href') || '';
      const match = link.match(/uddg=([^&]+)/);
      if (match) {
        link = decodeURIComponent(match[1]);
      }

      const title = a.text().trim();
      const snippet = $(element).find('.result__snippet').text().trim();

      if (title && link) {
        results.push({ title, link, snippet });
      }
    });

    return results;
  } catch (error) {
    console.error('DDG Arama hatası:', error.message);
    return [];
  }
}

// --- WIKIPEDIA ÖZET FONKSİYONU ---
async function getWikipediaSummary(query) {
  try {
    const url = `https://tr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    const response = await axios.get(url);
    if (response.data && response.data.extract) {
      return response.data.extract;
    }
  } catch (err) {
    // Wikipedia'da eşleşen sayfa bulunamadığında hata verebilir, yutuyoruz
  }
  return null;
}

// --- BOT MANTIĞI VE WEBSOCKET BAĞLANTISI ---
function connectWebSocket() {
  // Topluyo WebSocket veya API Endpoint adresi
  const ws = new WebSocket(`wss://topluyo.com/ws?key=${CLIENT_KEY}`);

  ws.on('open', () => {
    console.log('Topluyo WebSocket bağlantısı başarıyla kuruldu.');
  });

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());

      // Mesaj içerik kontrolü (Topluyo API mesaj formatına göre ayarlayabilirsiniz)
      const content = message.content || message.text || "";
      const channelId = message.channel_id || message.channelId;

      if (!content.startsWith('!')) return;

      const args = content.slice(1).trim().split(/ +/);
      const command = args.shift().toLowerCase();

      // --- !yardim KOMUTU ---
      if (command === 'yardim') {
        const yardimMesaji = `🤖 **Bot Komutları:**\n` +
          `• \`!ara <sorgu>\`: DuckDuckGo üzerinde arama yapar (Varsa Wikipedia özeti ekler).\n` +
          `• \`!davet\`: Sunucumuza katılım linkini gönderir.\n` +
          `• \`!yardim\`: Bu yardım menüsünü gösterir.`;
        sendMessage(ws, channelId, yardimMesaji);
      }

      // --- !davet KOMUTU ---
      else if (command === 'davet') {
        sendMessage(ws, channelId, `🎉 Sunucumuza katılmak için link: ${DAVET_LINKI}`);
      }

      // --- !ara KOMUTU ---
      else if (command === 'ara') {
        const query = args.join(' ');
        if (!query) {
          sendMessage(ws, channelId, '⚠️ Lütfen aratmak istediğiniz kelimeyi girin. Örnek: `!ara Yazılım`');
          return;
        }

        // Parallel aramalar
        const [wikiSummary, searchResults] = await Promise.all([
          getWikipediaSummary(query),
          duckDuckGoAra(query)
        ]);

        let responseText = "";

        // En üste Wikipedia özet bilgisi
        if (wikiSummary) {
          responseText += `📖 **Wikipedia Bilgisi:**\n${wikiSummary}\n\n---\n\n`;
        }

        // DuckDuckGo Arama Sonuçları
        if (searchResults.length > 0) {
          responseText += `🔍 **"${query}" İçin Arama Sonuçları:**\n\n`;
          searchResults.forEach((item, idx) => {
            responseText += `**${idx + 1}. [${item.title}](${item.link})**\n`;
            if (item.snippet) responseText += `${item.snippet}\n`;
            responseText += `\n`;
          });
        } else {
          responseText += `❌ "${query}" için her hangi bir sonuç bulunamadı.`;
        }

        sendMessage(ws, channelId, responseText);
      }

    } catch (err) {
      console.error('Mesaj işleme hatası:', err);
    }
  });

  ws.on('close', () => {
    console.log('Bağlantı koptu, 5 saniye sonra tekrar bağlanılıyor...');
    setTimeout(connectWebSocket, 5000);
  });

  ws.on('error', (err) => {
    console.error('WebSocket Hatası:', err.message);
  });
}

function sendMessage(ws, channelId, content) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      action: 'send_message',
      channel_id: channelId,
      content: content
    }));
  }
}

connectWebSocket();

const WebSocket = require('ws');
const axios = require('axios');
const cheerio = require('cheerio');

const CLIENT_KEY = process.env.CLIENT_KEY;
const DAVET_LINKI = "https://topluyo.com/";

if (!CLIENT_KEY) {
  console.error("HATA: CLIENT_KEY çevresel değişkeni bulunamadı!");
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
      if (i >= 5) return false;
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
    // Wikipedia makalesi bulunamadığında hatayı yut
  }
  return null;
}

// --- WEBSOCKET BAĞLANTISI VE BOT MANTIĞI ---
function startBot() {
  // Topluyo istemci bağlantısını Authorization başlığı ve origin bilgisi ile başlatıyoruz
  const ws = new WebSocket('wss://topluyo.com/ws', {
    headers: {
      'Authorization': `Bearer ${CLIENT_KEY}`,
      'User-Agent': 'Mozilla/5.0'
    },
    origin: 'https://topluyo.com'
  });

  ws.on('open', () => {
    console.log('Topluyo sunucusuna başarıyla bağlanıldı!');
  });

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      
      const content = msg.content || msg.text || msg.d?.content || "";
      const channelId = msg.channel_id || msg.channelId || msg.d?.channel_id;

      if (!content.startsWith('!')) return;

      const args = content.slice(1).trim().split(/ +/);
      const command = args.shift().toLowerCase();

      // !yardim
      if (command === 'yardim') {
        const text = `🤖 **Bot Komutları:**\n` +
          `• \`!ara <sorgu>\`: DuckDuckGo üzerinden arama yapar (Varsa Wikipedia özeti ekler).\n` +
          `• \`!davet\`: Sunucumuza katılım linkini gönderir.\n` +
          `• \`!yardim\`: Yardım menüsünü gösterir.`;
        sendMsg(ws, channelId, text);
      }

      // !davet
      else if (command === 'davet') {
        sendMsg(ws, channelId, `🎉 Sunucumuza katılmak için link: ${DAVET_LINKI}`);
      }

      // !ara
      else if (command === 'ara') {
        const query = args.join(' ');
        if (!query) {
          sendMsg(ws, channelId, '⚠️ Lütfen bir kelime girin. Örn: `!ara Yazılım`');
          return;
        }

        const [wikiSummary, searchResults] = await Promise.all([
          getWikipediaSummary(query),
          duckDuckGoAra(query)
        ]);

        let responseText = "";

        if (wikiSummary) {
          responseText += `📖 **Wikipedia Bilgisi:**\n${wikiSummary}\n\n---\n\n`;
        }

        if (searchResults.length > 0) {
          responseText += `🔍 **"${query}" İçin Arama Sonuçları:**\n\n`;
          searchResults.forEach((item, idx) => {
            responseText += `**${idx + 1}. [${item.title}](${item.link})**\n`;
            if (item.snippet) responseText += `${item.snippet}\n`;
            responseText += `\n`;
          });
        } else {
          responseText += `❌ "${query}" için sonuç bulunamadı.`;
        }

        sendMsg(ws, channelId, responseText);
      }
    } catch (e) {
      console.error('Mesaj işleme hatası:', e);
    }
  });

  ws.on('close', () => {
    console.log('Bağlantı kapandı, 5s sonra yeniden bağlanılıyor...');
    setTimeout(startBot, 5000);
  });

  ws.on('error', (err) => {
    console.error('WS Hatası:', err.message);
  });
}

function sendMsg(ws, channelId, content) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      action: 'send_message',
      channel_id: channelId,
      content: content
    }));
  }
}

startBot();

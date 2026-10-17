const { Client } = require('topluyo-bot');
const axios = require('axios');
const cheerio = require('cheerio');

// Render Environment Variables'tan çekilir
const CLIENT_KEY = process.env.CLIENT_KEY;
const DAVET_LINKI = "https://topluyo.com/"; // Kendi sunucu veya davet bağlantınız

if (!CLIENT_KEY) {
  console.error("HATA: CLIENT_KEY çevresel değişkeni bulunamadı! Render panelinden tanımlayın.");
  process.exit(1);
}

const client = new Client({
  token: CLIENT_KEY
});

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
      if (i >= 5) return false; // En fazla 5 sonuç
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
    console.error('DDG Arama Hatası:', error.message);
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
    // Wikipedia sonuç bulamadığında oluşan hatayı yutuyoruz
  }
  return null;
}

// --- BOT OLAYLARI (EVENTS) ---
client.on('ready', () => {
  console.log(`Bot başarıyla bağlandı ve aktif!`);
});

client.on('message', async (message) => {
  // Bot kendi mesajlarına yanıt vermesin
  if (message.author && message.author.bot) return;

  const content = message.content || "";
  if (!content.startsWith('!')) return;

  const args = content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // --- !yardim KOMUTU ---
  if (command === 'yardim') {
    const yardimText = `🤖 **Bot Komutları:**\n` +
      `• \`!ara <sorgu>\`: DuckDuckGo üzerinde arama yapar (Varsa Wikipedia özeti ekler).\n` +
      `• \`!davet\`: Sunucumuza katılım linkini gönderir.\n` +
      `• \`!yardim\`: Bu yardım menüsünü gösterir.`;
    
    if (typeof message.reply === 'function') {
      message.reply(yardimText);
    } else {
      message.channel.send(yardimText);
    }
  }

  // --- !davet KOMUTU ---
  else if (command === 'davet') {
    const davetText = `🎉 Sunucumuza katılmak için link: ${DAVET_LINKI}`;
    if (typeof message.reply === 'function') {
      message.reply(davetText);
    } else {
      message.channel.send(davetText);
    }
  }

  // --- !ara KOMUTU ---
  else if (command === 'ara') {
    const query = args.join(' ');
    if (!query) {
      const uyarText = '⚠️ Lütfen aratmak istediğiniz kelimeyi girin. Örnek: `!ara Yazılım`';
      if (typeof message.reply === 'function') message.reply(uyarText);
      else message.channel.send(uyarText);
      return;
    }

    // Wikipedia ve DuckDuckGo aramalarını paralel yürüt
    const [wikiSummary, searchResults] = await Promise.all([
      getWikipediaSummary(query),
      duckDuckGoAra(query)
    ]);

    let responseText = "";

    // Mesajın en üstüne varsa Wikipedia özeti
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
      responseText += `❌ "${query}" için herhangi bir sonuç bulunamadı.`;
    }

    if (typeof message.reply === 'function') {
      message.reply(responseText);
    } else {
      message.channel.send(responseText);
    }
  }
});

// Botu başlat
client.login(CLIENT_KEY);

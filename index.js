const Topluyo = require('topluyo-bot');
const axios = require('axios');
const cheerio = require('cheerio');

const CLIENT_KEY = process.env.CLIENT_KEY;
const DAVET_LINKI = "https://topluyo.com/";

if (!CLIENT_KEY) {
  console.error("HATA: CLIENT_KEY çevresel değişkeni bulunamadı!");
  process.exit(1);
}

// Botu başlat
const bot = new Topluyo(CLIENT_KEY);

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
    // Wikipedia sonuç vermezse hatayı yut
  }
  return null;
}

// --- BOT OLAYLARI ---
bot.on('ready', () => {
  console.log('Topluyo botu başarıyla bağlandı ve aktif!');
});

bot.on('message', async (message) => {
  const content = message.content || "";
  if (!content.startsWith('!')) return;

  const args = content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // !yardim
  if (command === 'yardim') {
    const text = `🤖 **Bot Komutları:**\n` +
      `• \`!ara <sorgu>\`: DuckDuckGo üzerinden arama yapar (Varsa Wikipedia özeti ekler).\n` +
      `• \`!davet\`: Sunucumuza katılım linkini gönderir.\n` +
      `• \`!yardim\`: Yardım menüsünü gösterir.`;
    
    message.reply ? message.reply(text) : message.channel.send(text);
  }

  // !davet
  else if (command === 'davet') {
    const text = `🎉 Sunucumuza katılmak için link: ${DAVET_LINKI}`;
    message.reply ? message.reply(text) : message.channel.send(text);
  }

  // !ara
  else if (command === 'ara') {
    const query = args.join(' ');
    if (!query) {
      const text = '⚠️ Lütfen bir kelime girin. Örn: `!ara Yazılım`';
      message.reply ? message.reply(text) : message.channel.send(text);
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

    message.reply ? message.reply(responseText) : message.channel.send(responseText);
  }
});

bot.login();

const { Client, GatewayIntentBits, EmbedBuilder, Partials } = require('discord.js');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// Discord Bot Setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages
  ],
  partials: [Partials.Channel, Partials.Message]
});

// Env’den al
const BOT_TOKEN = process.env.DISCORD_TOKEN;
const FRONTEND_URL = process.env.FRONTEND_URL; // OCST Mobile Render URL
const PORT = process.env.PORT || 3001;
const GUILD_ID = '832511730625544242';

// Express API
const app = express();
app.use(cors());
app.use(express.json());

// Subscribers dosyası
const SUBSCRIBERS_FILE = path.join(__dirname, 'subscribers.json');
let subscribers = [];

if (fs.existsSync(SUBSCRIBERS_FILE)) {
  try {
    subscribers = JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE));
    console.log(`📋 ${subscribers.length} kayıtlı kullanıcı yüklendi`);
  } catch {
    console.log('⚠️ Subscribers dosyası okunamadı, yeni liste oluşturuluyor');
    subscribers = [];
    fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(subscribers, null, 2));
  }
} else {
  subscribers = [];
  fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(subscribers, null, 2));
  console.log('✅ Subscribers.json oluşturuldu');
}

function saveSubscribers() {
  fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(subscribers, null, 2));
}

// Bot hazır olduğunda
client.once('ready', () => {
  console.log(`✅ Discord Bot Aktif: ${client.user.tag}`);
  console.log(`👥 Kayıtlı Kullanıcı Sayısı: ${subscribers.length}`);
  console.log(`🌐 Frontend URL: ${FRONTEND_URL}`);
});

// Acil DM gönderme
app.post('/send-emergency-dm', async (req, res) => {
  const { createdBy, phoneNumber, location, description, callId, timestamp } = req.body;

  if (!client.isReady()) return res.status(503).json({ error: 'Bot henüz hazır değil' });
  if (subscribers.length === 0) return res.json({ success: true, sent: 0, failed: 0, total: 0, message: 'Subscribers listesi boş' });

  const embed = new EmbedBuilder()
    .setTitle('🚨 ACİL ÇAĞRI')
    .setColor(0xFF0000)
    .addFields(
      { name: '👤 Çağrıyı Yapan', value: createdBy || 'Bilinmeyen', inline: true },
      { name: '🆔 Çağrı ID', value: `#${callId}`, inline: true },
      { name: '📍 Konum', value: location || 'Belirtilmemiş', inline: false },
      { name: '📝 Açıklama', value: description || 'Yok', inline: false },
      { name: '📞 İletişim', value: `**${phoneNumber || '0552 590 75 79'}**`, inline: true },
      { name: '🌐 OCST Mobile', value: `[Tıkla](${FRONTEND_URL})`, inline: true },
      { name: '🕐 Zaman', value: timestamp, inline: true }
    )
    .setFooter({ text: 'OCST Police CAD System - Acil Bildirim' })
    .setTimestamp();

  let successCount = 0, failCount = 0;
  const failedUsers = [], successUsers = [];

  for (const userId of subscribers) {
    try {
      const user = await client.users.fetch(userId);
      await user.send({ embeds: [embed] });
      successCount++;
      successUsers.push({ id: userId, tag: user.tag });
      await new Promise(resolve => setTimeout(resolve, 150));
    } catch (err) {
      failCount++;
      failedUsers.push({ id: userId, error: err.message });
    }
  }

  res.json({ success: true, sent: successCount, failed: failCount, total: subscribers.length, failedUsers, successUsers });
});

// Kullanıcı ekleme
app.post('/add-subscriber', (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId gerekli' });
  if (subscribers.includes(userId)) return res.status(409).json({ error: 'Kullanıcı zaten kayıtlı' });

  subscribers.push(userId);
  saveSubscribers();
  res.json({ success: true, message: 'Kullanıcı eklendi', total: subscribers.length });
});

// Kullanıcı silme
app.post('/remove-subscriber', (req, res) => {
  const { userId } = req.body;
  const index = subscribers.indexOf(userId);
  if (index === -1) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

  subscribers.splice(index, 1);
  saveSubscribers();
  res.json({ success: true, message: 'Kullanıcı silindi', total: subscribers.length });
});

// Listeyi getir
app.get('/subscribers', (req, res) => {
  res.json({ subscribers, total: subscribers.length });
});

// Bot durum kontrol
app.get('/status', (req, res) => {
  res.json({
    botReady: client.isReady(),
    botUser: client.user ? client.user.tag : null,
    subscribersCount: subscribers.length,
    uptime: client.uptime
  });
});

// Test DM
app.post('/test-dm', async (req, res) => {
  const { userId, message } = req.body;
  if (!client.isReady()) return res.status(503).json({ error: 'Bot henüz hazır değil' });

  try {
    const user = await client.users.fetch(userId);
    await user.send(message || 'Test mesajı - OCST Bot çalışıyor! ✅');
    res.json({ success: true, user: user.tag });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bot login
client.login(BOT_TOKEN).catch(err => {
  console.error('❌ Bot giriş yapamadı:', err.message);
  process.exit(1);
});

// Express sunucu başlat
app.listen(PORT, () => {
  console.log(`🤖 Discord Bot API çalışıyor → Port: ${PORT}`);
  console.log(`📡 Acil bildirimleri dinliyor...`);
});

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

// ÖNEMLI: Render'da Environment Variables kısmına şunu ekle:
// Key: DISCORD_TOKEN
// Value: (Discord Developer Portal'dan aldığın bot token'ı)
const BOT_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = '832511730625544242';

// Express API (Server.js'den istek almak için)
const app = express();
app.use(cors());
app.use(express.json());

// Kullanıcı ID'lerini saklamak için dosya
const SUBSCRIBERS_FILE = path.join(__dirname, 'subscribers.json');
let subscribers = [];

// Subscribers dosyasını yükle veya oluştur
if (fs.existsSync(SUBSCRIBERS_FILE)) {
  try {
    subscribers = JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE));
    console.log(`📋 ${subscribers.length} kayıtlı kullanıcı yüklendi`);
  } catch (err) {
    console.log('⚠️ Subscribers dosyası okunamadı, yeni liste oluşturuluyor');
    subscribers = [];
    fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(subscribers, null, 2));
  }
} else {
  console.log('📝 Subscribers dosyası bulunamadı, oluşturuluyor...');
  subscribers = [];
  fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(subscribers, null, 2));
  console.log('✅ Subscribers.json oluşturuldu');
}

// Subscribers'ı kaydet
function saveSubscribers() {
  fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(subscribers, null, 2));
}

// Bot hazır olduğunda
client.once('ready', () => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ Discord Bot Aktif: ${client.user.tag}`);
  console.log(`🤖 Bot ID: ${client.user.id}`);
  console.log(`🔔 Acil Bildirim Sistemi Hazır`);
  console.log(`👥 Kayıtlı Kullanıcı Sayısı: ${subscribers.length}`);
  console.log(`📁 Subscribers dosyası: ${SUBSCRIBERS_FILE}`);
  console.log(`${'='.repeat(50)}\n`);
  
  if (subscribers.length === 0) {
    console.log(`⚠️  UYARI: Henüz hiç kullanıcı eklenmemiş!`);
    console.log(`📝 Kullanıcı eklemek için:`);
    console.log(`   curl -X POST http://localhost:3001/add-subscriber -H "Content-Type: application/json" -d '{"userId":"DISCORD_USER_ID"}'\n`);
  }
});

// Acil DM gönderme endpoint'i (Server.js buraya istek atacak)
app.post('/send-emergency-dm', async (req, res) => {
  const { createdBy, phoneNumber, location, description, callId, timestamp } = req.body;

  if (!client.isReady()) {
    console.log('❌ Bot henüz hazır değil!');
    return res.status(503).json({ error: 'Bot henüz hazır değil' });
  }

  if (subscribers.length === 0) {
    console.log('⚠️ Subscribers listesi boş! Önce kullanıcı eklemelisiniz.');
    return res.json({
      success: true,
      sent: 0,
      failed: 0,
      total: 0,
      message: 'Subscribers listesi boş'
    });
  }

  console.log(`\n🚨🚨 ACİL ÇAĞRI ALINDI - DM'ler gönderiliyor... 🚨🚨`);
  console.log(`👤 Çağrıyı Yapan: ${createdBy}`);
  console.log(`📍 Konum: ${location}`);
  console.log(`📝 Açıklama: ${description}`);
  console.log(`📞 Telefon: ${phoneNumber}`);
  console.log(`🆔 Çağrı ID: #${callId}`);
  console.log(`👥 ${subscribers.length} kullanıcıya bildirim gönderiliyor...\n`);

  const embed = new EmbedBuilder()
    .setTitle('🚨🚨 ACİL ÇAĞRI - HEMEN MÜDAHALE GEREKİYOR! 🚨🚨')
    .setColor(0xFF0000)
    .addFields(
      { name: '👤 Çağrıyı Yapan', value: createdBy || 'Bilinmeyen', inline: true },
      { name: '🆔 Çağrı ID', value: `#${callId}`, inline: true },
      { name: '\u200B', value: '\u200B', inline: false },
      { name: '📍 Konum', value: location || 'Belirtilmemiş', inline: false },
      { name: '📝 Açıklama', value: description || 'Yok', inline: false },
      { name: '🕐 Zaman', value: timestamp, inline: true },
      { name: '📞 İletişim', value: `**${phoneNumber || '0552 590 75 79'}**`, inline: true }
    )
    .setFooter({ text: 'OCST Police CAD System - Acil Bildirim' })
    .setTimestamp();

  let successCount = 0;
  let failCount = 0;
  const failedUsers = [];
  const successUsers = [];

  for (const userId of subscribers) {
    try {
      console.log(`🔍 Kullanıcı aranıyor: ${userId}`);
      const user = await client.users.fetch(userId);
      console.log(`📤 DM gönderiliyor → ${user.tag} (${user.id})`);
      
      await user.send({ embeds: [embed] });
      
      console.log(`✅ DM başarıyla gönderildi → ${user.tag}`);
      successCount++;
      successUsers.push({ id: userId, tag: user.tag });
      
      // Her mesajdan sonra küçük bir bekleme (rate limit için)
      await new Promise(resolve => setTimeout(resolve, 150));
    } catch (err) {
      console.log(`❌ DM gönderilemedi (${userId}):`);
      console.log(`   Hata: ${err.message}`);
      console.log(`   Kod: ${err.code || 'Yok'}`);
      failedUsers.push({ id: userId, error: err.message });
      failCount++;
    }
  }

  console.log(`\n📊 SONUÇ:`);
  console.log(`✅ Başarılı: ${successCount}`);
  console.log(`❌ Başarısız: ${failCount}`);
  console.log(`📊 Toplam: ${subscribers.length}`);
  
  if (successUsers.length > 0) {
    console.log(`\n✅ Başarılı kullanıcılar:`);
    successUsers.forEach(u => console.log(`   - ${u.tag} (${u.id})`));
  }
  
  if (failedUsers.length > 0) {
    console.log(`\n❌ Başarısız kullanıcılar:`);
    failedUsers.forEach(u => console.log(`   - ${u.id}: ${u.error}`));
  }
  console.log('');

  res.json({
    success: true,
    sent: successCount,
    failed: failCount,
    total: subscribers.length,
    failedUsers: failedUsers,
    successUsers: successUsers
  });
});

// Kullanıcı ekleme endpoint'i
app.post('/add-subscriber', (req, res) => {
  const { userId } = req.body;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId gerekli' });
  }

  if (subscribers.includes(userId)) {
    return res.status(409).json({ error: 'Kullanıcı zaten kayıtlı' });
  }

  subscribers.push(userId);
  saveSubscribers();
  console.log(`➕ Yeni kullanıcı eklendi: ${userId}`);
  
  res.json({ 
    success: true, 
    message: 'Kullanıcı eklendi',
    total: subscribers.length 
  });
});

// Kullanıcı silme endpoint'i
app.post('/remove-subscriber', (req, res) => {
  const { userId } = req.body;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId gerekli' });
  }

  const index = subscribers.indexOf(userId);
  if (index === -1) {
    return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
  }

  subscribers.splice(index, 1);
  saveSubscribers();
  console.log(`➖ Kullanıcı silindi: ${userId}`);
  
  res.json({ 
    success: true, 
    message: 'Kullanıcı silindi',
    total: subscribers.length 
  });
});

// Tüm subscribers listesini getir
app.get('/subscribers', (req, res) => {
  res.json({ 
    subscribers: subscribers,
    total: subscribers.length 
  });
});

// Bot durumunu kontrol et
app.get('/status', (req, res) => {
  res.json({
    botReady: client.isReady(),
    botUser: client.user ? client.user.tag : null,
    subscribersCount: subscribers.length,
    uptime: client.uptime
  });
});

// Test DM gönderme (tek kullanıcıya)
app.post('/test-dm', async (req, res) => {
  const { userId, message } = req.body;
  
  if (!client.isReady()) {
    return res.status(503).json({ error: 'Bot henüz hazır değil' });
  }

  try {
    const user = await client.users.fetch(userId);
    await user.send(message || 'Test mesajı - OCST Bot çalışıyor! ✅');
    console.log(`✅ Test DM gönderildi → ${user.tag}`);
    res.json({ success: true, user: user.tag });
  } catch (err) {
    console.log(`❌ Test DM gönderilemedi: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Bot'u başlat
client.login(BOT_TOKEN).catch(err => {
  console.error('❌ Bot giriş yapamadı:', err.message);
  process.exit(1);
});

// Express sunucusunu başlat
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🤖 Discord Bot API çalışıyor → Port: ${PORT}`);
  console.log(`📡 Acil bildirimleri dinliyor...\n`);
});
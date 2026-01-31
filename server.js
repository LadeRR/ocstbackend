const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
  cors: { 
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  } 
});

// CORS düzeltmesi - tüm originlere izin ver
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(express.json());

// Discord Webhook'leri (env'den çekiyoruz – Render'da Environment Variables kısmına ekle)
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK || "https://discord.com/api/webhooks/1466651197363454072/LbukP7UrHVqusJLzx7f7s1PMatzpB2L20h5LNT41NeUtLCRe9OMNc9rPlhh9_rrO_34S";
const DISCORD_WEBHOOK_CHAT = process.env.DISCORD_WEBHOOK_CHAT || "BURAYA_SOHBET_WEBHOOK_URLSINI_YAZ"; // Render'da değiştir

let calls = [];
let users = [];
let chatHistory = [];

const CALLS_FILE = path.join(__dirname, 'calls.json');
const USERS_FILE = path.join(__dirname, 'users.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');
const CHAT_FILE = path.join(__dirname, 'chat.json');

// Config dosyasını yükle veya oluştur
function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE));
      console.log(`✅ Config.json yüklendi: ${config.users.length} kullanıcı`);
      return config.users;
    } catch (err) {
      console.log('⚠️ Config okuma hatası, varsayılan oluşturuluyor');
    }
  }

  // Varsayılan config
  const defaultConfig = {
    users: [
      { id: 1, username: "ducks", password: "ducks1234", type: "admin", phone: "0544 124 84 24" },
      { id: 2, username: "valyre", password: "valyre1234", type: "user", phone: "0533 659 19 57" },
      { id: 3, username: "lade", password: "lade1234", type: "user", phone: "0552 590 75 79" }
    ]
  };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
  console.log('✅ config.json oluşturuldu');
  return defaultConfig.users;
}

// Kullanıcıları config'den yükle
users = loadConfig();

// Diğer dosyaları yükle
if (fs.existsSync(CALLS_FILE)) calls = JSON.parse(fs.readFileSync(CALLS_FILE));
if (fs.existsSync(CHAT_FILE)) {
  try {
    chatHistory = JSON.parse(fs.readFileSync(CHAT_FILE));
  } catch (err) {
    chatHistory = [];
  }
}
console.log(`👥 Kullanıcılar: ${users.map(u => u.username).join(', ')}`);

// Config'i kaydet
function saveConfig() {
  const config = {
    users: users.map(u => ({
      id: u.id,
      username: u.username,
      password: u.password,
      type: u.type,
      phone: u.phone || '0552 590 75 79' // Varsayılan telefon
    }))
  };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Sohbet geçmişini kaydet
function saveChatHistory() {
  fs.writeFileSync(CHAT_FILE, JSON.stringify(chatHistory, null, 2));
}

// Discord'a sohbet mesajı gönder
async function sendChatToDiscord(username, message) {
  if (!DISCORD_WEBHOOK_CHAT || DISCORD_WEBHOOK_CHAT === "BURAYA_SOHBET_WEBHOOK_URLSINI_YAZ") {
    return; // Webhook ayarlanmamış
  }

  try {
    await fetch(DISCORD_WEBHOOK_CHAT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `**${username}:** ${message}`
      })
    });
    console.log('Discord sohbet mesajı gönderildi');
  } catch (err) {
    console.log('Discord sohbet webhook hatası:', err.message);
  }
}

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  const user = users.find(u => u.username === username);

  if (!user) {
    return res.status(401).json({ error: 'Kullanıcı bulunamadı' });
  }

  if (user.password !== password) {
    return res.status(401).json({ error: 'Yanlış şifre' });
  }

  console.log(`✅ Giriş: ${username}`);
  res.json({ user: { id: user.id, username: user.username, type: user.type } });
});

// Profil bilgilerini getir
app.get('/api/profile/:userId', (req, res) => {
  const userId = Number(req.params.userId);
  const user = users.find(u => u.id === userId);

  if (!user) {
    return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
  }

  res.json({
    id: user.id,
    username: user.username,
    type: user.type
  });
});

// Şifre değiştirme
app.put('/api/profile/:userId/password', (req, res) => {
  const userId = Number(req.params.userId);
  const { currentPassword, newPassword } = req.body;

  const user = users.find(u => u.id === userId);

  if (!user) {
    return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
  }

  if (user.password !== currentPassword) {
    return res.status(401).json({ error: 'Mevcut şifre yanlış' });
  }

  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'Yeni şifre en az 4 karakter olmalı' });
  }

  user.password = newPassword;
  saveConfig();

  console.log(`🔐 Şifre değiştirildi: ${user.username}`);
  res.json({ message: 'Şifre başarıyla değiştirildi' });
});

// Kullanıcı ekleme (sadece admin)
app.post('/api/users', (req, res) => {
  const { username, password, type } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' });
  }

  if (users.some(u => u.username === username)) {
    return res.status(409).json({ error: 'Kullanıcı adı zaten mevcut' });
  }

  const newUser = {
    id: Math.max(...users.map(u => u.id), 0) + 1,
    username,
    password,
    type: type || 'user'
  };

  users.push(newUser);
  saveConfig();

  console.log(`➕ Yeni kullanıcı eklendi: ${username}`);
  res.json({ message: 'Kullanıcı eklendi', user: newUser });
});

// Kullanıcı silme (sadece admin)
app.delete('/api/users/:userId', (req, res) => {
  const userId = Number(req.params.userId);
  const index = users.findIndex(u => u.id === userId);

  if (index === -1) {
    return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
  }

  const deletedUser = users[index];
  users.splice(index, 1);
  saveConfig();

  console.log(`➖ Kullanıcı silindi: ${deletedUser.username}`);
  res.json({ message: 'Kullanıcı silindi' });
});

// Tüm kullanıcıları listele
app.get('/api/users', (req, res) => {
  res.json(users.map(u => ({ id: u.id, username: u.username, type: u.type })));
});

// Sohbet geçmişini getir
app.get('/api/chat', (req, res) => {
  res.json(chatHistory);
});

// Sohbet mesajı ekle
app.post('/api/chat', async (req, res) => {
  const { userId, username, message } = req.body;

  const chatMessage = {
    id: Date.now(),
    userId,
    username,
    message,
    timestamp: new Date().toLocaleString('tr-TR')
  };

  chatHistory.push(chatMessage);
  saveChatHistory();

  // Discord'a gönder
  await sendChatToDiscord(username, message);

  io.emit('chat-message', chatMessage);
  res.json(chatMessage);
});

// Sohbeti temizle
app.delete('/api/chat', (req, res) => {
  chatHistory = [];
  saveChatHistory();
  io.emit('chat-cleared');
  console.log('🧹 Sohbet temizlendi');
  res.json({ message: 'Sohbet temizlendi' });
});

// Calls
app.get('/api/calls', (req, res) => res.json(calls));
app.post('/api/calls', async (req, res) => {
  const call = {
    id: Date.now(),
    timestamp: new Date().toLocaleString('tr-TR'),
    status: 'ALINDI',
    createdBy: req.body.createdBy || 'Bilinmeyen',
    ...req.body
  };
  calls.push(call);
  fs.writeFileSync(CALLS_FILE, JSON.stringify(calls, null, 2));
  io.emit('new-call', call);

  // Discord'a bildirim gönder
  try {
    const isEmergency = call.priority && call.priority.toLowerCase() === 'acil';
    
    const user = users.find(u => u.username === call.createdBy);
    const phoneNumber = user && user.phone ? user.phone : '0552 590 75 79';

    const embedMessage = {
      embeds: [{
        title: isEmergency ? '🚨🚨 ACİL ÇAĞRI - HEMEN MÜDAHALE GEREKİYOR! 🚨🚨' : '🚨 YENİ ÇAĞRI ALINDI',
        color: isEmergency ? 0xff0000 : 0xffaa00,
        fields: [
          { name: '👤 Çağrıyı Yapan', value: call.createdBy, inline: true },
          { name: '📍 Konum', value: call.location || 'Belirtilmemiş', inline: true },
          { name: '⚠️ Öncelik', value: call.priority || 'Normal', inline: true },
          { name: '📝 Açıklama', value: call.description || 'Yok', inline: false },
          { name: '🕐 Zaman', value: call.timestamp, inline: true },
          { name: '🆔 Çağrı ID', value: `#${call.id}`, inline: true },
          { name: '📊 Durum', value: call.status, inline: true }
        ],
        footer: { text: 'OCST Police CAD System' },
        timestamp: new Date().toISOString()
      }]
    };

    if (isEmergency) {
      embedMessage.embeds[0].fields.push({
        name: '📞 İLETİŞİM',
        value: `**Lütfen şu numara ile iletişime geçin: ${phoneNumber}**`,
        inline: false
      });
      embedMessage.content = '@everyone';
    }

    await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embedMessage)
    });

    console.log(`Discord bildirimi gönderildi - Çağrı #${call.id}${isEmergency ? ' (ACİL)' : ''}`);
  } catch (err) {
    console.log('Discord bildirimi gönderilemedi:', err.message);
  }

  res.status(201).json(call);
});

app.put('/api/calls/:id', (req, res) => {
  const id = Number(req.params.id);
  const call = calls.find(c => c.id === id);
  if (!call) return res.status(404).json({ error: 'Çağrı yok' });
  Object.assign(call, req.body);
  fs.writeFileSync(CALLS_FILE, JSON.stringify(calls, null, 2));
  io.emit('call-updated', call);
  res.json(call);
});

app.delete('/api/calls', (req, res) => {
  calls = [];
  fs.writeFileSync(CALLS_FILE, JSON.stringify(calls, null, 2));
  io.emit('calls-cleared');
  res.json({ message: 'Tüm çağrılar temizlendi' });
});

app.put('/api/calls/:id/note', (req, res) => {
  const id = Number(req.params.id);
  const { note } = req.body;
  const call = calls.find(c => c.id === id);
  if (!call) return res.status(404).json({ error: 'Çağrı yok' });
  call.note = note;
  fs.writeFileSync(CALLS_FILE, JSON.stringify(calls, null, 2));
  io.emit('call-updated', call);
  res.json(call);
});

// Socket.IO
io.on('connection', (socket) => {
  console.log('Yeni bağlantı:', socket.id);

  socket.on('join', (userId) => {
    const user = users.find(u => u.id === userId);
    if (user) {
      user.socketId = socket.id;
      io.emit('users-update', users.filter(u => u.socketId).map(u => ({
        id: u.id,
        username: u.username,
        type: u.type,
        socketId: u.socketId
      })));
    }
  });

  socket.on('chat-message', async (msg) => {
    const chatMessage = {
      ...msg,
      id: Date.now(),
      timestamp: new Date().toLocaleString('tr-TR')
    };

    chatHistory.push(chatMessage);
    saveChatHistory();

    await sendChatToDiscord(msg.username, msg.message);

    io.emit('chat-message', chatMessage);
  });

  socket.on('request-location', (targetUserId) => {
    const target = users.find(u => u.id === targetUserId);
    if (target?.socketId) {
      io.to(target.socketId).emit('location-request');
    }
  });

  socket.on('share-location', (data) => {
    io.emit('user-location', data);
  });

  socket.on('send-notification', ({ targetUserId, message }) => {
    const target = users.find(u => u.id === targetUserId);
    if (target?.socketId) {
      io.to(target.socketId).emit('notification', message);
    }
  });

  socket.on('disconnect', () => {
    const user = users.find(u => u.socketId === socket.id);
    if (user) {
      delete user.socketId;
      io.emit('users-update', users.filter(u => u.socketId).map(u => ({
        id: u.id,
        username: u.username,
        type: u.type,
        socketId: u.socketId
      })));
    }
    console.log('Bağlantı koptu:', socket.id);
  });
});

// Sunucuyu başlat
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚔 OCST Backend çalışıyor → port: ${PORT}`);
  console.log(`Render'da canlı URL: https://dashboard.render.com/static/srv-d5u8jknpm1nc73dcuor0 (Render log'undan bak)`);
});

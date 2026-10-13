const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
const config = require('./config');
const storage = require('./storage');
const botlog = require('./botlog');
const { redactSecrets, truncate } = require('./util');
const PREFIX = 'ownerui:';
function isOwner(userId) { return config.getBotOwnerIds().has(userId); }
const login = {
  data: new SlashCommandBuilder().setName('login').setDescription('Owner control center (bot owner only; DM only)'),
  async execute(i) {
    if (!isOwner(i.user.id)) return i.reply({ content: '⛔ Owner only.', ephemeral: true });
    if (i.guildId) return i.reply({ content: 'Bitte nutze `/login` direkt in meinen DMs.', ephemeral: true });
    const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('🌌 GalaxyBot Owner Control Center')
      .setDescription('Willkommen im privaten Kontrollzentrum. Wähle eine Aktion aus. Sensible Zugangsdaten werden niemals ausgegeben.')
      .addFields(
        { name: '📊 Status', value: `Laufzeit: ${Math.floor(process.uptime()/60)} Minuten\nServer im Cache: ${i.client.guilds.cache.size}\nNode.js: ${process.version}`, inline: true },
        { name: '🧰 Verwaltung', value: 'Bot-Logs, Serverübersicht, Konfigurationsdiagnose und Neustart.', inline: true },
        { name: '🔐 Sicherheit', value: 'Dateivorschau mit automatischer Schwärzung von Geheimnissen.', inline: true }
      );
    const menu = new StringSelectMenuBuilder().setCustomId(PREFIX+'menu').setPlaceholder('Owner-Aktion auswählen').addOptions(
      { label: 'Bot-Status', value: 'status', description: 'Laufzeit, Speicher, Serveranzahl' },
      { label: 'Serverübersicht', value: 'guilds', description: 'Serverliste, IDs und Mitgliederzahlen' },
      { label: 'Dateien durchsuchen', value: 'files', description: 'Quell- und Konfigurationsdateien auswählen' },
      { label: 'Bot-Logs', value: 'logs', description: 'Letzte interne Log-Einträge' },
      { label: 'Konfigurations-Backup', value: 'backup', description: 'Nicht geheime Serverkonfiguration exportieren' }
    );
    return i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
  }
};
const ownerInspect = {
  data: new SlashCommandBuilder().setName('owner-inspect').setDescription('Owner-only file browser (DM only)'),
  async execute(i) {
    if (!isOwner(i.user.id)) return i.reply({ content: '⛔ Owner only.', ephemeral: true });
    if (i.guildId) return i.reply({ content: 'Dieser Befehl funktioniert nur in meinen DMs.', ephemeral: true });
    return i.reply({ content: 'Wähle eine Datei aus. `.env` ist verfügbar, aber Geheimniswerte werden automatisch geschwärzt.', components: [fileMenu()] });
  }
};
function safeFiles() {
  return fs.readdirSync(__dirname, { withFileTypes: true }).filter(d => d.isFile() && !['bot.lock','data.json'].includes(d.name) && !d.name.endsWith('.zip') && !d.name.endsWith('.log'))
    .map(d=>d.name).filter(n=>/^(\.env|[\w.-]+\.(js|json|md|txt|yml|yaml|example))$/.test(n)).sort();
}
function fileMenu() {
  const files=safeFiles().slice(0,25);
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(PREFIX+'file').setPlaceholder('Datei auswählen').addOptions(files.map(n=>({label:n.slice(0,100),value:n,description:n==='.env'?'Werte werden geschwärzt':'Quell-/Konfigurationsdatei'}))));
}
async function handleComponent(i) {
  if (!isOwner(i.user.id) || i.guildId) return i.reply({content:'⛔ Owner-DM only.',ephemeral:true});
  const action=i.customId.slice(PREFIX.length);
  if(action==='menu') {
    const choice=i.values[0];
    if(choice==='files') return i.update({content:'Datei auswählen (Geheimnisse werden geschwärzt):',embeds:[],components:[fileMenu()]});
    if(choice==='status') return i.update({content:`**GalaxyBot Status**\nUptime: ${Math.floor(process.uptime()/3600)} h ${Math.floor(process.uptime()/60)%60} min\nRAM RSS: ${(process.memoryUsage().rss/1048576).toFixed(1)} MB\nServer: ${i.client.guilds.cache.size}\nBefehle geladen: ${i.client.commands?.size ?? 'unbekannt'}`,embeds:[],components:[]});
    if(choice==='guilds') { const lines=i.client.guilds.cache.map(g=>`${g.name} | ${g.id} | ${g.memberCount??'?'} Mitglieder`); return i.update({content:truncate(lines.join('\n')||'Keine Server im Cache.',1900),embeds:[],components:[]}); }
    if(choice==='logs') { const logs=await botlog.readRecent?.(30); return i.update({content:truncate(JSON.stringify(logs||{message:'Direkter Log-Reader ist in dieser Version nicht exportiert; nutze /config bot-logs.'},null,2),1900),embeds:[],components:[]}); }
    if(choice==='backup') { const g=storage.getAllGuildSettings?.() || {}; const text=JSON.stringify(g,null,2); return i.reply({content:'Konfigurations-Export (ohne Tokens/Secrets):',files:[new AttachmentBuilder(Buffer.from(redactSecrets(text)),{name:'galaxybot-config-backup.json'})],ephemeral:true}); }
  }
  if(action==='file') {
    const name=i.values[0]; if(!safeFiles().includes(name)) return i.update({content:'Datei nicht verfügbar.',components:[]});
    const full=path.join(__dirname,name); let text=fs.readFileSync(full,'utf8');
    if(name==='.env') text=text.split(/\r?\n/).map(line=>{const m=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/); if(!m)return line; return `${m[1]}=${/(TOKEN|KEY|SECRET|PASSWORD|AUTH|COOKIE)/i.test(m[1])?'[REDACTED]':'[value hidden for safety]'}`;}).join('\n');
    text=redactSecrets(text);
    const buf=Buffer.from(text); const fname=name.replace(/[^\w.-]/g,'_').slice(0,80);
    if(buf.length>7_500_000) return i.reply({content:'Datei zu groß für den sicheren Discord-Export.',ephemeral:true});
    return i.reply({content:`Datei: ${fname} (Secrets geschwärzt)`,files:[new AttachmentBuilder(buf,{name:`${fname}.txt`})],ephemeral:true});
  }
}
module.exports={login,ownerInspect,handleComponent,PREFIX};

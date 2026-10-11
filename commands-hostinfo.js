// /hostinfo - public, read-only information about the machine running GalaxyBot.
const os = require('node:os');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit >= 2 ? 2 : 0)} ${units[unit]}`;
}

function cpuSnapshot() {
  return os.cpus().map(({ times }) => ({ ...times }));
}

function cpuUsage(before, after) {
  let idle = 0;
  let total = 0;
  const count = Math.min(before.length, after.length);
  for (let i = 0; i < count; i++) {
    const a = before[i];
    const b = after[i];
    const deltaIdle = Math.max(0, b.idle - a.idle);
    const deltaTotal = Math.max(0,
      (b.user - a.user) + (b.nice - a.nice) + (b.sys - a.sys) +
      (b.irq - a.irq) + (b.idle - a.idle));
    idle += deltaIdle;
    total += deltaTotal;
  }
  return total > 0 ? Math.max(0, Math.min(100, (1 - idle / total) * 100)) : null;
}

const hostinfo = {
  data: new SlashCommandBuilder()
    .setName('hostinfo')
    .setDescription('Shows public system information about the host running GalaxyBot'),
  async execute(interaction) {
    await interaction.deferReply();
    const before = cpuSnapshot();
    await new Promise(resolve => setTimeout(resolve, 500));
    const after = cpuSnapshot();

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = Math.max(0, totalMem - freeMem);
    const memPct = totalMem > 0 ? (usedMem / totalMem) * 100 : 0;
    const cpuPct = cpuUsage(before, after);
    const cpuList = os.cpus();
    const model = cpuList[0]?.model?.trim() || 'Unknown CPU';
    const platformNames = { win32: 'Windows', darwin: 'macOS', linux: 'Linux', freebsd: 'FreeBSD', openbsd: 'OpenBSD', android: 'Android' };
    const platform = platformNames[process.platform] || process.platform;
    const uptimeSeconds = Math.floor(os.uptime());
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);

    const embed = new EmbedBuilder()
      .setTitle('🖥️ GalaxyBot · Host-Informationen')
      .setColor(0x5865f2)
      .setDescription('Öffentliche Live-Messung des Systems, auf dem der Bot läuft.')
      .addFields(
        { name: '🧩 Betriebssystem', value: `${platform} ${os.release()}`, inline: true },
        { name: '⚙️ Plattform', value: `\`${process.platform}\` · \`${process.arch}\``, inline: true },
        { name: '🤖 Node.js', value: process.version, inline: true },
        { name: '🔋 CPU-Auslastung', value: cpuPct === null ? 'Nicht verfügbar' : `${cpuPct.toFixed(1)} % (über 0,5 s gemessen)`, inline: true },
        { name: '🧠 RAM-Auslastung', value: `${formatBytes(usedMem)} / ${formatBytes(totalMem)} (${memPct.toFixed(1)} %)` , inline: true },
        { name: '🔢 CPU-Kerne', value: `${cpuList.length}`, inline: true },
        { name: '🏷️ CPU-Modell', value: model.slice(0, 200), inline: false },
        { name: '⏱️ Host-Laufzeit', value: `${days} T · ${hours} Std. · ${minutes} Min.`, inline: true },
        { name: '🟢 Bot-Status', value: 'Online', inline: true },
        { name: '🕒 Gemessen am', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
      )
      .setFooter({ text: 'Hinweis: In Containern können RAM-/CPU-Werte Host-Werte statt Container-Limits zeigen.' });

    await interaction.editReply({ embeds: [embed] });
  },
};

module.exports = { hostinfo };

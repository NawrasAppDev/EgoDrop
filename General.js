import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';
import fetch from 'node-fetch';
import {
  warningsMap, points, levels, titles,
  saveWarnings, savePoints, saveLevels, saveTitles
} from '../utils/commands.js';

let activeChannel = null;
let intervalRunning = false;
let lastDropTime = 0;
let postedCodes = new Set();

export const data = [
  new SlashCommandBuilder().setName('setup').setDescription('Auto-post Blue Lock Rivals codes every 30 minutes'),
  new SlashCommandBuilder().setName('checkcodes').setDescription('Manually check the latest Blue Lock codes'),
  new SlashCommandBuilder().setName('nextdrop').setDescription('Time left until next auto-code drop'),
  new SlashCommandBuilder().setName('ping').setDescription('Check bot response time'),
  new SlashCommandBuilder().setName('rank').setDescription('Show user rank').addUserOption(opt => opt.setName('user').setDescription('Target user')),
  new SlashCommandBuilder().setName('profile').setDescription('Show profile info').addUserOption(opt => opt.setName('user').setDescription('Target user')),
  new SlashCommandBuilder().setName('title').setDescription('Set your profile title').addStringOption(opt => opt.setName('new').setDescription('New title').setRequired(true)),
  new SlashCommandBuilder().setName('setlevel').setDescription('Set user level').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)).addIntegerOption(opt => opt.setName('level').setDescription('Level').setRequired(true)),
  new SlashCommandBuilder().setName('top').setDescription('Show top 3 users by level'),
  new SlashCommandBuilder().setName('points_set').setDescription('Set user points').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)).addIntegerOption(opt => opt.setName('points').setDescription('Points').setRequired(true)),
  new SlashCommandBuilder().setName('points_increase').setDescription('Add points').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)).addIntegerOption(opt => opt.setName('points').setDescription('Amount').setRequired(true)),
  new SlashCommandBuilder().setName('points_decrease').setDescription('Subtract points').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)).addIntegerOption(opt => opt.setName('points').setDescription('Amount').setRequired(true)),
  new SlashCommandBuilder().setName('warn').setDescription('Warn a user').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(true)),
  new SlashCommandBuilder().setName('warn_remove').setDescription('Clear warnings').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)),
  new SlashCommandBuilder().setName('warnings').setDescription('List warnings').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)),
  new SlashCommandBuilder().setName('clear').setDescription('Delete messages').addIntegerOption(opt => opt.setName('number').setDescription('Number').setRequired(true)),
  new SlashCommandBuilder().setName('lock').setDescription('Lock current channel'),
  new SlashCommandBuilder().setName('unlock').setDescription('Unlock current channel'),
  new SlashCommandBuilder().setName('help').setDescription('Show all bot commands')
];

export async function execute(interaction) {
  const name = interaction.commandName;
  const user = interaction.options.getUser('user');
  const member = interaction.guild?.members.cache.get(user?.id || interaction.user.id);

  // Blue Lock System
  if (name === 'setup') {
    if (intervalRunning) return interaction.reply({ content: '⚠️ Already running.', ephemeral: true });
    activeChannel = interaction.channel;
    intervalRunning = true;
    lastDropTime = Date.now();
    const codes = await fetchCodes(true);
    const embed = new EmbedBuilder().setTitle('📦 Blue Lock Rivals Codes').setColor(0x0099FF);
    embed.setDescription(codes.length ? codes.join('\n') : '❌ No new codes now.');
    await interaction.reply({ embeds: [embed] });

    setInterval(async () => {
      lastDropTime = Date.now();
      await fetchCodes(false);
    }, 30 * 60 * 1000);
    return;
  }

  if (name === 'checkcodes') {
    const codes = await fetchCodes(true, true);
    const embed = new EmbedBuilder().setTitle('📦 Latest Blue Lock Codes').setColor(0x00AEFF);
    embed.setDescription(codes.length ? codes.join('\n') : '❌ No codes found.');
    return interaction.reply({ embeds: [embed] });
  }

  if (name === 'nextdrop') {
    if (!intervalRunning) return interaction.reply('Not running.');
    const ms = 30 * 60 * 1000 - (Date.now() - lastDropTime);
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return interaction.reply(`Next drop in ${m}m ${s}s`);
  }

  // XP + Profile
  if (name === 'rank') {
    const uid = (user || interaction.user).id;
    const sorted = [...levels.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    const rank = sorted.indexOf(uid) + 1;
    return interaction.reply(rank ? `#${rank} in levels.` : 'Not ranked.');
  }

  if (name === 'profile') {
    const uid = (user || interaction.user).id;
    const lvl = levels.get(uid) || 0;
    const pts = points.get(uid) || 0;
    const title = titles.get(uid) || 'None';
    const embed = new EmbedBuilder().setTitle(`${user?.username || interaction.user.username}'s Profile`).addFields(
      { name: 'Level', value: lvl.toString(), inline: true },
      { name: 'Points', value: pts.toString(), inline: true },
      { name: 'Title', value: title, inline: false }
    ).setColor(0x00AEFF);
    return interaction.reply({ embeds: [embed] });
  }

  if (name === 'title') {
    titles.set(interaction.user.id, interaction.options.getString('new'));
    await saveTitles();
    return interaction.reply('🏷️ Title updated.');
  }

  if (name === 'setlevel') {
    levels.set(user.id, interaction.options.getInteger('level'));
    await saveLevels();
    return interaction.reply('✅ Level set.');
  }

  if (name === 'top') {
    const sorted = [...levels.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const topText = sorted.map(([id, lvl], i) => `${i + 1}. <@${id}> — Level ${lvl}`).join('\n');
    return interaction.reply(`🏆 Top 3:\n${topText}`);
  }

  // Points System
  if (name === 'points_set') {
    points.set(user.id, interaction.options.getInteger('points'));
    await savePoints();
    return interaction.reply(`✅ Set ${user.username}'s points.`);
  }

  if (name === 'points_increase') {
    const val = interaction.options.getInteger('points');
    points.set(user.id, (points.get(user.id) || 0) + val);
    await savePoints();
    return interaction.reply(`➕ Added ${val} points to ${user.username}`);
  }

  if (name === 'points_decrease') {
    const val = interaction.options.getInteger('points');
    points.set(user.id, Math.max(0, (points.get(user.id) || 0) - val));
    await savePoints();
    return interaction.reply(`➖ Removed ${val} points from ${user.username}`);
  }

  // Warning System
  if (name === 'warn') {
    const reason = interaction.options.getString('reason');
    const list = warningsMap.get(user.id) || [];
    warningsMap.set(user.id, [...list, reason]);
    await saveWarnings();
    return interaction.reply(`⚠️ Warned ${user.username}: ${reason}`);
  }

  if (name === 'warn_remove') {
    warningsMap.delete(user.id);
    await saveWarnings();
    return interaction.reply(`✅ Removed all warnings for ${user.username}`);
  }

  if (name === 'warnings') {
    const list = warningsMap.get(user.id) || [];
    return interaction.reply(`⚠️ Warnings:\n${list.map((r, i) => `${i + 1}. ${r}`).join('\n') || 'None'}`);
  }

  // Moderation
  if (name === 'clear') {
    const amount = interaction.options.getInteger('number');
    try {
      const msgs = await interaction.channel.messages.fetch({ limit: amount });
      const deleted = await interaction.channel.bulkDelete(msgs, true);
      return interaction.reply({ content: `🧹 Deleted ${deleted.size} messages`, ephemeral: true });
    } catch {
      return interaction.reply({ content: '❌ Could not delete messages.', ephemeral: true });
    }
  }

  if (name === 'lock') {
    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
    return interaction.reply('🔒 Channel locked.');
  }

  if (name === 'unlock') {
    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: true });
    return interaction.reply('🔓 Channel unlocked.');
  }

  // Utility
  if (name === 'ping') return interaction.reply('🏓 Pong!');
  if (name === 'help') return interaction.reply('📜 Commands: /setup /checkcodes /nextdrop /rank /profile /title /setlevel /top /points_set /points_increase /points_decrease /warn /warn_remove /warnings /clear /lock /unlock /help');
}

// Fetch Blue Lock Codes
async function fetchCodes(isManual = false, showAll = false) {
  if (!activeChannel && !isManual) return [];
  try {
    const res = await fetch('https://beebom.com/blue-lock-rivals-codes/');
    const html = await res.text();
    const match = [...html.matchAll(/<li>\s*<strong>(.*?)<\/strong>(.*?)<\/li>/g)];
    if (!match.length) return [];
    const newCodes = match.map(m => {
      const code = m[1].trim();
      const desc = m[2].replace(/<[^>]+>/g, '').replace(/NEW/gi, '🆕').trim();
      return { code, text: `🔑 **${code}** — ${desc}` };
    });

    const filtered = showAll ? newCodes : newCodes.filter(x => !postedCodes.has(x.code));
    filtered.forEach(x => postedCodes.add(x.code));

    if (!isManual && activeChannel && filtered.length) {
      const embed = new EmbedBuilder()
        .setTitle('📦 New Blue Lock Rivals Codes!')
        .setDescription(filtered.map(c => c.text).join('\n'))
        .setColor(0x00AEFF)
        .setFooter({ text: `Posted at ${new Date().toLocaleString()}` });
      await activeChannel.send({ embeds: [embed] });
    }

    return filtered.map(c => c.text);
  } catch (err) {
    console.error('❌ Error fetching codes:', err);
    return [];
  }
}

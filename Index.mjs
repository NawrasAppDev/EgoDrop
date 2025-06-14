
import { Client, Collection, GatewayIntentBits, REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import { readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ]
});

client.commands = new Collection();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const commands = [];
const commandsPath = path.join(__dirname, 'commands');

// Load all commands in the /commands folder
for (const file of readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const { data, execute } = await import(`./commands/${file}`);

  if (Array.isArray(data)) {
    data.forEach(cmd => {
      client.commands.set(cmd.name, { data: cmd, execute });
      commands.push(cmd.toJSON());
    });
  } else {
    client.commands.set(data.name, { data, execute });
    commands.push(data.toJSON());
  }
}

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ Slash commands auto-registered.');
  } catch (error) {
    console.error('❌ Failed to register slash commands:', error);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);

    // Reply if not already replied
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '✅ Command executed.', ephemeral: true });
    }
  } catch (error) {
    console.error(error);
    if (!interaction.replied) {
      await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
    }
  }
});

client.login(process.env.TOKEN);

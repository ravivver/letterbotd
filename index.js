// index.js

import { Client, GatewayIntentBits, Collection, MessageFlags } from 'discord.js';
import dotenv from 'dotenv'; 
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url'; 
import { checkDailyWatchedFilms } from './tasks/dailyWatchedChecker.js'; // Import the new function

dotenv.config();

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!DISCORD_BOT_TOKEN) {
    console.error('Error: DISCORD_BOT_TOKEN not found in .env!');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, // Required for guild information
        GatewayIntentBits.MessageContent,
    ],
});

client.commands = new Collection();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commandsPath = path.join(__dirname, 'commands'); 
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js')); 

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file); 
    const commandUrl = pathToFileURL(filePath).href; 
    const command = await import(commandUrl); 

    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`Command loaded: ${command.data.name}`);
    } else {
        console.warn(`[WARNING] The command in ${filePath} is missing "data" or "execute" property.`);
    }
}

client.once('ready', c => {
    console.log(`Bot connected! Logged in as ${c.user.tag}`);
    console.log(`Bot is in ${client.guilds.cache.size} servers.`);

    // Schedule the daily check task
    setInterval(() => {
        checkDailyWatchedFilms(client);
    }, 20 * 60 * 1000); // 20 minutes

    // Run once on startup to catch films watched since the bot was last online
    checkDailyWatchedFilms(client); 
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No matching command found for ${interaction.commandName}.`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'An error occurred while executing this command!', flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ content: 'An error occurred while executing this command!', flags: MessageFlags.Ephemeral });
        }
    }
});

client.login(DISCORD_BOT_TOKEN);

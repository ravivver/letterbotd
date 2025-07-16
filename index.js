// index.js

import { Client, GatewayIntentBits, Collection, MessageFlags } from 'discord.js';
import dotenv from 'dotenv'; 
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url'; 
import { checkDailyWatchedFilms } from './tasks/dailyWatchedChecker.js';

// Load environment variables from .env file
dotenv.config();

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

// Exit if Discord bot token is not found
if (!DISCORD_BOT_TOKEN) {
    console.error('Error: DISCORD_BOT_TOKEN not found in .env!');
    process.exit(1);
}

// Create a new Discord client with specified intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, // Required for guild-related events (e.g., slash commands)
        GatewayIntentBits.MessageContent, // Required to read message content (if needed, though slash commands are preferred)
    ],
});

// Create a collection to store bot commands
client.commands = new Collection();

// Resolve __filename and __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read command files from the 'commands' directory
const commandsPath = path.join(__dirname, 'commands'); 
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js')); 

// Dynamically import and load commands
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file); 
    const commandUrl = pathToFileURL(filePath).href; // Convert file path to a URL for dynamic import
    
    try {
        const module = await import(commandUrl);
        let command;

        // Check if it's a default export (like trip.js, similar.js, soundtrack.js, letterid.js)
        if (module.default && typeof module.default === 'object' && ('data' in module.default || 'execute' in module.default)) {
            command = module.default;
        } 
        // Otherwise, attempt to load as CommonJS (module.exports) or named exports
        else {
            command = module; // For modules that directly export 'data' and 'execute'
        }

        // Ensure the command has 'data' and 'execute' properties
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            console.log(`Command loaded: ${command.data.name}`);
        } else {
            console.warn(`[WARNING] The command in ${filePath} is missing "data" or "execute" property.`);
        }
    } catch (error) {
        console.error(`[ERROR] Failed to load command from ${filePath}:`, error.message);
    }
}

// Event listener for when the bot is ready
client.once('ready', c => {
    console.log(`Bot connected! Logged in as ${c.user.tag}`);
    console.log(`Bot is in ${client.guilds.cache.size} servers.`);

    // Schedule daily watched films check to run every 20 minutes
    setInterval(() => {
        checkDailyWatchedFilms(client);
    }, 20 * 60 * 1000); // 20 minutes in milliseconds

    // Run the check immediately on startup
    checkDailyWatchedFilms(client); 
});

// Event listener for interaction creation (e.g., slash commands)
client.on('interactionCreate', async interaction => {
    // Only process chat input commands
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    // If no matching command is found, log an error and return
    if (!command) {
        console.error(`No matching command found for ${interaction.commandName}.`);
        return;
    }

    try {
        await command.execute(interaction); // Execute the command
    } catch (error) {
        console.error(error);
        // Respond to the user about the error, using ephemeral messages
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'An error occurred while executing this command!', flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ content: 'An error occurred while executing this command!', flags: MessageFlags.Ephemeral });
        }
    }
});

// Log in to Discord with the bot token
client.login(DISCORD_BOT_TOKEN);
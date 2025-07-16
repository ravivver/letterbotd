// index.js

import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import { config } from 'dotenv';

// Import button handling functions from familymatch
import { handleJoinButton, handleCloseButton } from './commands/familymatch.js';

config(); // Load environment variables from .env

const token = process.env.DISCORD_BOT_TOKEN; // .env variable name

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        // Add other intents if necessary for other functionalities
    ],
});

client.commands = new Collection();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const commandsPath = join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    const commandUrl = pathToFileURL(filePath).href;

    import(commandUrl)
        .then(commandModule => {
            let command;
            // Adapt loading logic for different export types (default or named/CommonJS)
            if (commandModule.default && typeof commandModule.default === 'object' && ('data' in commandModule.default || 'execute' in commandModule.default)) {
                command = commandModule.default;
            } else {
                command = commandModule; // Assume 'data' and 'execute' are directly in the module
            }

            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
            } else {
                console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
            }
        })
        .catch(error => {
            console.error(`Failed to load command from ${filePath}:`, error);
        });
}

client.once(Events.ClientReady, c => {
    console.log(`Ready! Logged in as ${c.user.tag}`);
    console.log(`Bot is in ${c.guilds.cache.size} servers.`);
    console.log(`Loaded ${client.commands.size} commands.`); 
});

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'An error occurred while executing this command!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'An error occurred while executing this command!', ephemeral: true });
            }
        }
    } else if (interaction.isButton()) {
        if (interaction.customId === 'familymatch_join') {
            await handleJoinButton(interaction);
        } else if (interaction.customId === 'familymatch_close') {
            await handleCloseButton(interaction);
        }
    } else if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith('movie_quiz_')) {
            // The quiz handling logic with Select Menu should already be in quiz.js
            // and using a MessageComponentCollector.
            // This block here can be a fallback, but the main part is the collector.
            // For now, we don't need specific logic here for the quiz,
            // as quiz.js already manages its own interaction.
        }
    } else {
        return;
    }
});

client.login(token);
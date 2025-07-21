import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import fs from 'node:fs'; // Manter esta importação síncrona para fs.readdirSync
import { promises as fsPromises } from 'node:fs'; // Adicionado: Importação assíncrona para escrita de arquivos
import { config } from 'dotenv';
import { checkDailyWatchedFilms } from './tasks/dailyWatchedChecker.js'; 

import { handleJoinButton, handleCloseButton } from './commands/familymatch.js';

config(); 

const token = process.env.DISCORD_BOT_TOKEN; 

// --- Configuração do Logging em Arquivo ---
const LOG_FILE_PATH = join(dirname(fileURLToPath(import.meta.url)), 'bot_logs.txt');

async function writeToLogFile(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    try {
        await fsPromises.appendFile(LOG_FILE_PATH, logMessage, 'utf8');
    } catch (err) {
        // Se houver erro ao escrever no arquivo, pelo menos tente logar no console
        console.error(`ERROR WRITING TO LOG FILE: ${err.message}\nOriginal Message: ${message}`);
    }
}

// Sobrescrever console.log e console.error para incluir logging em arquivo
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = function(...args) {
    originalConsoleLog.apply(console, args);
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
    writeToLogFile(`INFO: ${message}`);
};

console.error = function(...args) {
    originalConsoleError.apply(console, args);
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
    writeToLogFile(`ERROR: ${message}`);
};
// --- Fim da Configuração do Logging em Arquivo ---


const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
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
            if (commandModule.default && typeof commandModule.default === 'object' && ('data' in commandModule.default || 'execute' in commandModule.default)) {
                command = commandModule.default;
            } else {
                command = commandModule; 
            }

            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                console.log(`[LOAD] Command loaded: ${command.data.name}`); 
            } else {
                console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
            }
        })
        .catch(error => {
            console.error(`Failed to load command from ${filePath}:`, error);
        });
}

client.once(Events.ClientReady, async c => { 
    console.log(`Ready! Logged in as ${c.user.tag}`);
    console.log(`Bot is in ${c.guilds.cache.size} servers.`);
    console.log(`Loaded ${client.commands.size} commands.`);

    console.log('[Scheduler] Executando a checagem diária na inicialização...');
    await checkDailyWatchedFilms(client);

    const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; 
    setInterval(async () => {
        console.log('[Scheduler] Executando a checagem diária agendada...');
        await checkDailyWatchedFilms(client);
    }, CHECK_INTERVAL_MS);
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
        }
    } else {
        return;
    }
});

client.login(token);
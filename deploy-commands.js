import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

dotenv.config();

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!DISCORD_BOT_TOKEN) {
    console.error('Error: DISCORD_BOT_TOKEN not found in .env!');
    process.exit(1);
}
if (!CLIENT_ID) {
    console.error('Error: CLIENT_ID not found in .env! Get it from Developer Portal > General Information > Application ID.');
    process.exit(1);
}
if (!GUILD_ID) {
    console.error('Error: GUILD_ID not found in .env! Get your test server ID (right-click server icon > Copy ID).');
    process.exit(1);
}

const commands = [];
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const commandUrl = pathToFileURL(filePath).href; 
    
    try {
        const module = await import(commandUrl);
        let command;

        // Verifica se é um export default (como o similar.js)
        if (module.default && typeof module.default === 'object' && ('data' in module.default || 'execute' in module.default)) {
            command = module.default;
        } 
        // Caso contrário, tenta como CommonJS (module.exports) ou exports nomeados
        else {
            command = module; // Para módulos que exportam 'data' e 'execute' diretamente (CommonJS ou ES nomeado)
        }

        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
        } else {
            console.warn(`[WARNING] The command in ${filePath} is missing "data" or "execute" property.`);
        }
    } catch (error) {
        console.error(`[ERROR] Failed to load command from ${filePath}:`, error.message);
    }
}

const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);

(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        console.log(`Attempting to register commands GLOBALLY...`);
        const globalData = await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands },
        );
        console.log(`Successfully reloaded ${globalData.length} global application (/) commands.`);
        console.log(`(Global commands may take up to an hour to propagate to all servers.)`);

        console.log(`Attempting to register commands for GUILD ${GUILD_ID}...`);
        const guildData = await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands },
        );
        console.log(`Successfully reloaded ${guildData.length} application (/) commands for guild ${GUILD_ID}.`);
        console.log(`(Commands for guild ${GUILD_ID} should appear almost instantly.)`);

    } catch (error) {
        console.error(error);
    }
})();
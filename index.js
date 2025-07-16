// index.js

import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { fileURLToPath, pathToFileURL } from 'node:url'; // pathToFileURL já deve estar aqui
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import { config } from 'dotenv';

// Importa as funções de tratamento de botão do familymatch
import { handleJoinButton, handleCloseButton } from './commands/familymatch.js';

config(); // Carrega as variáveis de ambiente do .env

const token = process.env.DISCORD_BOT_TOKEN; // Nome da variável do .env

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        // Adicione outros intents se necessário para outras funcionalidades
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
            // Adapta a lógica de carregamento para diferentes tipos de export (default ou nomeado/CommonJS)
            if (commandModule.default && typeof commandModule.default === 'object' && ('data' in commandModule.default || 'execute' in commandModule.default)) {
                command = commandModule.default;
            } else {
                command = commandModule; // Assume que 'data' e 'execute' estão diretamente no module
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
    console.log(`Pronto! Logado como ${c.user.tag}`);
    console.log(`Bot está em ${c.guilds.cache.size} servidores.`);
    console.log(`Carregados ${client.commands.size} comandos.`); 
});

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`Nenhum comando correspondente a ${interaction.commandName} foi encontrado.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'Ocorreu um erro ao executar este comando!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'Ocorreu um erro ao executar este comando!', ephemeral: true });
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
            // A lógica de tratamento do quiz com Select Menu já deve estar no quiz.js
            // e usando um MessageComponentCollector.
            // Este bloco aqui pode ser um fallback, mas o principal é o coletor.
            // Por enquanto, não precisamos de lógica específica aqui para o quiz,
            // pois o quiz.js já gerencia sua própria interação.
        }
    } else {
        return;
    }
});

client.login(token);
// index.js

import { Client, GatewayIntentBits, Collection, MessageFlags } from 'discord.js'; // Adicionado MessageFlags
import dotenv from 'dotenv'; 
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url'; 
import { checkDailyWatchedFilms } from './tasks/dailyWatchedChecker.js'; // Importa a nova função

dotenv.config();

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!DISCORD_BOT_TOKEN) {
    console.error('Erro: DISCORD_BOT_TOKEN não encontrado no arquivo .env!');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
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
        console.log(`Comando carregado: ${command.data.name}`);
    } else {
        console.warn(`[AVISO] O comando em ${filePath} está faltando a propriedade "data" ou "execute".`);
    }
}

client.once('ready', c => {
    console.log(`Bot conectado! Logado como ${c.user.tag}`);
    console.log(`Estou em ${client.guilds.cache.size} servidores.`);

    // Agendamento da tarefa de verificação diária
    // A cada 20 minutos (1200000 ms)
    // Ajuste o intervalo conforme a sua preferência e número de usuários
    setInterval(() => {
        checkDailyWatchedFilms(client);
    }, 20 * 60 * 1000); // 20 minutos (20 * 60 segundos * 1000 milissegundos)

    // Executa uma vez ao iniciar para pegar filmes assistidos desde a última vez que o bot estava offline
    checkDailyWatchedFilms(client); 
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`Nenhum comando correspondente encontrado para ${interaction.commandName}.`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'Ocorreu um erro ao executar este comando!', flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ content: 'Ocorreu um erro ao executar este comando!', flags: MessageFlags.Ephemeral });
        }
    }
});

client.login(DISCORD_BOT_TOKEN);

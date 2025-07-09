// deploy-commands.js

import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url'; // <<< Adicionado pathToFileURL

dotenv.config();

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// Verificações
if (!DISCORD_BOT_TOKEN) {
    console.error('Erro: DISCORD_BOT_TOKEN não encontrado no .env!');
    process.exit(1);
}
if (!CLIENT_ID) {
    console.error('Erro: CLIENT_ID não encontrado no .env! Obtenha-o no Portal de Desenvolvedores > General Information > Application ID.');
    process.exit(1);
}
if (!GUILD_ID) {
    console.error('Erro: GUILD_ID não encontrado no .env! Obtenha o ID do seu servidor de testes (clique com o botão direito no ícone do servidor > Copiar ID).');
    process.exit(1);
}

const commands = [];
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    // <<< MUDANÇA CRÍTICA AQUI: Converte o caminho do sistema de arquivos para URL antes de importar
    const commandUrl = pathToFileURL(filePath).href; 
    const command = await import(commandUrl); // Importa o módulo do comando usando a URL
    // <<< FIM DA MUDANÇA CRÍTICA >>>
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
    } else {
        console.warn(`[AVISO] O comando em ${filePath} está faltando a propriedade "data" ou "execute".`);
    }
}

const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);

(async () => {
    try {
        console.log(`Iniciando o registro de ${commands.length} comandos de aplicação.`);

        const data = await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands },
        );

        console.log(`Registro bem-sucedido de ${data.length} comandos de aplicação no servidor.`);
    } catch (error) {
        console.error(error);
    }
})();
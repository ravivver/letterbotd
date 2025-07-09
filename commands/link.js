// commands/link.js

import { SlashCommandBuilder, MessageFlags } from 'discord.js'; // Adicionado MessageFlags
import fs from 'node:fs/promises'; 
import path from 'node:path';
import { fileURLToPath } from 'node:url'; // Corrigido ' = ' para ' from '

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

export const data = new SlashCommandBuilder()
    .setName('link')
    .setDescription('Associa seu ID do Discord a um nome de usuário do Letterboxd.')
    .addStringOption(option =>
        option.setName('username')
            .setDescription('Seu nome de usuário no Letterboxd (ex: seu_usuario)')
            .setRequired(true));

export async function execute(interaction) {
    // Deferral efêmero, pois a resposta final é sempre efêmera.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }); 

    const letterboxdUsername = interaction.options.getString('username');
    const discordId = interaction.user.id;

    try {
        let users = {};
        try {
            const data = await fs.readFile(usersFilePath, 'utf8');
            users = JSON.parse(data);
        } catch (readError) {
            if (readError.code === 'ENOENT') {
                users = {};
            } else {
                console.error(`Erro ao ler users.json: ${readError.message}`);
                await interaction.editReply({
                    content: 'Ocorreu um erro interno ao tentar ler os vínculos de usuário. Por favor, tente novamente mais tarde.',
                    flags: MessageFlags.Ephemeral // EFÊMERO
                });
                return;
            }
        }

        users[discordId] = letterboxdUsername;

        await fs.writeFile(usersFilePath, JSON.stringify(users, null, 4), 'utf8');

        await interaction.editReply({
            content: `Seu ID do Discord foi vinculado ao usuário do Letterboxd: \`${letterboxdUsername}\`.`,
            flags: MessageFlags.Ephemeral // EFÊMERO
        });

    } catch (error) {
        console.error(`Erro ao vincular usuário ${discordId} com ${letterboxdUsername}:`, error);
        await interaction.editReply({
            content: `Ocorreu um erro ao vincular sua conta Letterboxd. Detalhes: ${error.message}`,
            flags: MessageFlags.Ephemeral // EFÊMERO
        });
    }
}
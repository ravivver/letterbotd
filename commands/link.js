// commands/link.js

import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import fs from 'node:fs/promises'; 
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkUserExists } from '../scraper/checkUserExists.js'; // NOVO: Importa a função de verificação

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
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }); 

    const letterboxdUsername = interaction.options.getString('username').trim(); // ALTERADO: Adicionado .trim()
    const discordId = interaction.user.id;

    // --- NOVA ETAPA DE VERIFICAÇÃO ---
    const verification = await checkUserExists(letterboxdUsername);

    if (verification.status !== 'SUCCESS') {
      // Se o usuário não for encontrado, o perfil for privado, ou ocorrer um erro, avisa e encerra.
      await interaction.editReply({ 
        content: `Não foi possível vincular: ${verification.message}`,
        flags: MessageFlags.Ephemeral
      });
      return; 
    }
    // --- FIM DA VERIFICAÇÃO ---

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
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
        }

        users[discordId] = letterboxdUsername;

        await fs.writeFile(usersFilePath, JSON.stringify(users, null, 4), 'utf8');

        await interaction.editReply({
            content: `Sua conta do Discord foi vinculada com sucesso ao perfil do Letterboxd: \`${letterboxdUsername}\`.`,
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        console.error(`Erro ao vincular usuário ${discordId} com ${letterboxdUsername}:`, error);
        await interaction.editReply({
            content: `Ocorreu um erro ao vincular sua conta Letterboxd. Detalhes: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}
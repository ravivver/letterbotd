// commands/profile.js

import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url'; // Corrigido ' = ' para ' from '
import getProfileStats from '../scraper/getProfileStats.js'; // Importa o novo scraper de perfil
import { createProfileEmbed } from '../utils/formatEmbed.js'; // Importa o novo criador de embed de perfil

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

export const data = new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Mostra as estatísticas do perfil Letterboxd de um usuário.')
    .addUserOption(option =>
        option.setName('usuario')
            .setDescription('Mencione outro usuário do Discord para ver o perfil dele.')
            .setRequired(false));

export async function execute(interaction) {
    await interaction.deferReply(); // Deferral público por padrão

    let targetDiscordId = interaction.user.id;
    let targetUserTag = interaction.user.tag;

    const mentionedUser = interaction.options.getUser('usuario');
    if (mentionedUser) {
        targetDiscordId = mentionedUser.id;
        targetUserTag = mentionedUser.tag;
    }

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
                    content: 'Ocorreu um erro interno ao buscar os vínculos de usuário. Por favor, tente novamente mais tarde.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
        }

        const letterboxdUsername = users[targetDiscordId];

        if (!letterboxdUsername) {
            await interaction.editReply({
                content: `O usuário ${targetUserTag} não vinculou sua conta Letterboxd ainda. Peça para ele usar \`/link\`!`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Chamar o scraper para obter as estatísticas do perfil
        const profileStats = await getProfileStats(letterboxdUsername);

        if (!profileStats) {
            await interaction.editReply({
                content: `Não foi possível obter as estatísticas do perfil de \`${letterboxdUsername}\`.`,
                // Esta mensagem é pública. Se quiser efêmera, adicione flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Criar o embed com as estatísticas
        const { embed } = await createProfileEmbed(profileStats, letterboxdUsername);

        // Enviar o embed (editando o deferReply inicial)
        await interaction.editReply({
            embeds: [embed],
            // Não há imagem separada aqui, então não precisamos de 'files'
        });

    } catch (error) {
        console.error(`Erro ao processar comando /profile para ${targetUserTag}:`, error);
        let errorMessage = `Ocorreu um erro ao acessar o perfil Letterboxd deste usuário. Detalhes: ${error.message}`;
        if (error.message.includes('Perfil Letterboxd é privado')) {
            errorMessage = `O perfil Letterboxd de \`${letterboxdUsername}\` é privado. Não é possível acessar as estatísticas.`;
        } else if (error.message.includes('Usuário Letterboxd não encontrado')) {
            errorMessage = `O usuário Letterboxd \`${letterboxdUsername}\` não foi encontrado.`;
        } else if (error.message.includes('Não foi possível conectar ao Letterboxd')) {
            errorMessage = `Não foi possível conectar ao Letterboxd. Verifique a conexão do bot ou tente novamente mais tarde.`;
        }
        await interaction.editReply({
            content: errorMessage,
            flags: MessageFlags.Ephemeral
        });
    }
}
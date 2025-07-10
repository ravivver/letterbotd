// commands/last.js (Versão Corrigida)

import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import getRecentDiaryEntries from '../scraper/getDiary.js';
import { searchMovieTMDB } from '../api/tmdb.js';
import { createDiaryEmbed } from '../utils/formatEmbed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

export const data = new SlashCommandBuilder()
    .setName('last')
    .setDescription('Mostra o último filme assistido no Letterboxd de um usuário.')
    .addUserOption(option =>
        option.setName('usuario')
            .setDescription('Mencione outro usuário do Discord para ver o último filme dele.')
            .setRequired(false));

export async function execute(interaction) {
    await interaction.deferReply();

    let targetDiscordId = interaction.options.getUser('usuario')?.id || interaction.user.id;
    const targetUser = interaction.options.getUser('usuario') || interaction.user;

    try {
        let users = {};
        try {
            const data = await fs.readFile(usersFilePath, 'utf8');
            users = JSON.parse(data);
        } catch (readError) {
            if (readError.code !== 'ENOENT') {
                console.error(`Erro ao ler users.json: ${readError.message}`);
                return interaction.editReply({ content: 'Ocorreu um erro interno ao buscar os vínculos.', flags: [MessageFlags.Ephemeral] });
            }
        }

        const letterboxdUsername = users[targetDiscordId];

        if (!letterboxdUsername) {
            const who = targetUser.id === interaction.user.id ? 'Você não vinculou sua conta' : `O usuário ${targetUser.displayName} não vinculou a conta`;
            return interaction.editReply({ content: `${who} Letterboxd. Use /link.`, flags: [MessageFlags.Ephemeral] });
        }

        const films = await getRecentDiaryEntries(letterboxdUsername);

        if (!films || films.length === 0) {
            return interaction.editReply({ content: `Não encontrei nenhum filme no diário de \`${letterboxdUsername}\` ou o diário está vazio.` });
        }

        const latestFilm = films[0];

        // --- VALIDAÇÃO ADICIONADA AQUI ---
        // Verificamos se o scraper conseguiu extrair as informações essenciais.
        if (!latestFilm || !latestFilm.title || !latestFilm.url) {
            console.error('Erro de scraping: O objeto do último filme retornado é inválido.', latestFilm);
            return interaction.editReply({ content: 'Não foi possível extrair os detalhes do último filme do diário. O formato da página do Letterboxd pode ter mudado.', flags: [MessageFlags.Ephemeral] });
        }
        // --- FIM DA VALIDAÇÃO ---

        let tmdbDetails = null;
        if (latestFilm.title && latestFilm.year) {
             try {
                 tmdbDetails = await searchMovieTMDB(latestFilm.title, latestFilm.year);
             } catch (tmdbError) {
                 console.error(`Erro ao buscar TMDB para ${latestFilm.title}:`, tmdbError.message);
             }
        }

        const embed = await createDiaryEmbed(latestFilm, tmdbDetails, letterboxdUsername);

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error(`Erro ao processar comando /last para ${targetUser.tag}:`, error);
        // Mensagem de erro mais amigável e sem o "anta" :)
        await interaction.editReply({
            content: `Ocorreu um erro ao buscar os dados do Letterboxd. Verifique se o perfil é público e o nome de usuário está correto. Detalhes: ${error.message}`,
            flags: [MessageFlags.Ephemeral]
        });
    }
}
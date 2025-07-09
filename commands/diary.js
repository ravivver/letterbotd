import { SlashCommandBuilder } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import getRecentDiaryEntries from '../scraper/getDiary.js';
import { searchMovieTMDB } from '../api/tmdb.js';
import { createDailyDiaryEmbed, formatDateBr } from '../utils/formatEmbed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

export const data = new SlashCommandBuilder()
    .setName('diary')
    .setDescription('Mostra todos os filmes assistidos em um dia específico no Letterboxd.')
    .addUserOption(option =>
        option.setName('usuario')
            .setDescription('Mencione outro usuário do Discord para ver o diário dele.')
            .setRequired(false))
    .addIntegerOption(option =>
        option.setName('dia')
            .setDescription('O dia (DD) dos filmes assistidos.')
            .setRequired(false))
    .addIntegerOption(option =>
        option.setName('mes')
            .setDescription('O mês (MM) dos filmes assistidos.')
            .setRequired(false))
    .addIntegerOption(option =>
        option.setName('ano')
            .setDescription('O ano (AAAA) dos filmes assistidos.')
            .setRequired(false));

export async function execute(interaction) {
    let targetDiscordId = interaction.user.id;
    let targetUserTag = interaction.user.tag;

    const mentionedUser = interaction.options.getUser('usuario');
    if (mentionedUser) {
        targetDiscordId = mentionedUser.id;
        targetUserTag = mentionedUser.tag;
    }

    const inputDay = interaction.options.getInteger('dia');
    const inputMonth = interaction.options.getInteger('mes');
    const inputYear = interaction.options.getInteger('ano');

    if ((inputDay || inputMonth || inputYear) && !(inputDay && inputMonth && inputYear)) {
        await interaction.reply({
            content: `Por favor, forneça o dia, mês **e** ano, ou nenhum para usar a data atual.`,
            ephemeral: true
        });
        return;
    }

    if (inputDay && inputMonth && inputYear) {
        const testDate = new Date(inputYear, inputMonth - 1, inputDay);
        if (isNaN(testDate.getTime()) || testDate.getDate() !== inputDay || testDate.getMonth() + 1 !== inputMonth || testDate.getFullYear() !== inputYear) {
            await interaction.reply({
                content: `Data inválida fornecida. Por favor, use um formato de data válido (ex: dia: 09 mes: 07 ano: 2025).`,
                ephemeral: true
            });
            return;
        }
    }

    await interaction.deferReply();

    try {
        let users = {};
        try {
            const data = await fs.readFile(usersFilePath, 'utf8');
            users = JSON.parse(data);
        } catch (readError) {
            if (readError.code !== 'ENOENT') {
                console.error(`Erro ao ler users.json: ${readError.message}`);
                await interaction.editReply({
                    content: 'Erro interno ao buscar os vínculos de usuário.',
                });
                return;
            }
        }

        const letterboxdUsername = users[targetDiscordId];
        if (!letterboxdUsername) {
            await interaction.editReply({
                content: `O usuário ${targetUserTag} não vinculou sua conta Letterboxd ainda. Peça para ele usar \`/link\`!`,
            });
            return;
        }

        let targetDate = new Date();
        if (inputDay && inputMonth && inputYear) {
            targetDate = new Date(inputYear, inputMonth - 1, inputDay);
        }

        const targetDateFormatted = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
        const targetDateBr = formatDateBr(`${String(targetDate.getDate()).padStart(2, '0')} ${targetDate.toLocaleString('en-US', { month: 'short' })} ${targetDate.getFullYear()}`);

        const allRecentFilms = await getRecentDiaryEntries(letterboxdUsername);
        if (!allRecentFilms || allRecentFilms.length === 0) {
            await interaction.editReply({
                content: `Não encontrei nenhum filme no diário de \`${letterboxdUsername}\` ou o diário está vazio.`,
            });
            return;
        }

        const filmsForTargetDate = allRecentFilms.filter(film => film.watchedDateFull === targetDateFormatted);
        if (filmsForTargetDate.length === 0) {
            await interaction.editReply({
                content: `O usuário \`${letterboxdUsername}\` não assistiu nenhum filme em ${targetDateBr}.`,
            });
            return;
        }

        const filmsWithTmdbDetails = [];
        for (const film of filmsForTargetDate) {
            let tmdbDetails = null;
            if (film.title && film.year) {
                try {
                    tmdbDetails = await searchMovieTMDB(film.title, film.year);
                } catch (tmdbError) {
                    console.error(`Erro ao buscar TMDB para ${film.title}:`, tmdbError.message);
                }
            }
            filmsWithTmdbDetails.push({ ...film, tmdbDetails });
        }

        const embed = await createDailyDiaryEmbed(filmsWithTmdbDetails, letterboxdUsername, targetDateBr);
        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error(`Erro no /diary para ${targetUserTag}:`, error);
        await interaction.editReply({
            content: `Erro ao acessar o Letterboxd. Detalhes: ${error.message}`,
        });
    }
}

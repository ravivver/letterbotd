import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import getRecentDiaryEntries from '../scraper/getDiary.js';
import { searchMovieTMDB } from '../api/tmdb.js';
import { createDailyDiaryEmbed, formatDateEn } from '../utils/formatEmbed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

export const data = new SlashCommandBuilder()
    .setName('diary')
    .setDescription('Shows all movies watched on a specific date on Letterboxd.')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Mention another Discord user to view their diary.')
            .setRequired(false))
    .addIntegerOption(option =>
        option.setName('day')
            .setDescription('The day (DD) of the watched movies.')
            .setRequired(false))
    .addIntegerOption(option =>
        option.setName('month')
            .setDescription('The month (MM) of the watched movies.')
            .setRequired(false))
    .addIntegerOption(option =>
        option.setName('year')
            .setDescription('The year (YYYY) of the watched movies.')
            .setRequired(false));

export async function execute(interaction) {
    let targetDiscordId = interaction.user.id;
    let targetUserTag = interaction.user.tag;

    const mentionedUser = interaction.options.getUser('user');
    if (mentionedUser) {
        targetDiscordId = mentionedUser.id;
        targetUserTag = mentionedUser.tag;
    }

    const inputDay = interaction.options.getInteger('day');
    const inputMonth = interaction.options.getInteger('month');
    const inputYear = interaction.options.getInteger('year');

    if ((inputDay || inputMonth || inputYear) && !(inputDay && inputMonth && inputYear)) {
        await interaction.reply({
            content: `Please provide the day, month **and** year, or none to use the current date.`,
            ephemeral: true
        });
        return;
    }

    if (inputDay && inputMonth && inputYear) {
        const testDate = new Date(inputYear, inputMonth - 1, inputDay);
        if (isNaN(testDate.getTime()) || testDate.getDate() !== inputDay || testDate.getMonth() + 1 !== inputMonth || testDate.getFullYear() !== inputYear) {
            await interaction.reply({
                content: `Invalid date provided. Please use a valid date format (e.g., day: 09 month: 07 year: 2025).`,
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
                console.error(`Error reading users.json: ${readError.message}`);
                await interaction.editReply({
                    content: 'Internal error fetching user links.',
                });
                return;
            }
        }

        let letterboxdUsername;
        const userEntry = users[targetDiscordId];
        if (typeof userEntry === 'string') {
            letterboxdUsername = userEntry;
        } else if (typeof userEntry === 'object' && userEntry !== null) {
            letterboxdUsername = userEntry.letterboxd;
        }

        if (!letterboxdUsername) {
            await interaction.editReply({
                content: `User ${targetUserTag} has not linked their Letterboxd account yet. Ask them to use \`/link\`!`,
            });
            return;
        }

        let targetDate = new Date();
        if (inputDay && inputMonth && inputYear) {
            targetDate = new Date(inputYear, inputMonth - 1, inputDay);
        }

        const targetDateFormatted = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
        const targetDateEn = formatDateEn(`${String(targetDate.getDate()).padStart(2, '0')} ${targetDate.toLocaleString('en-US', { month: 'short' })} ${targetDate.getFullYear()}`);

        const allRecentFilms = await getRecentDiaryEntries(letterboxdUsername);
        if (!allRecentFilms || allRecentFilms.length === 0) {
            await interaction.editReply({
                content: `Could not find any movies in \`${letterboxdUsername}\`'s diary or the diary is empty.`,
            });
            return;
        }

        const filmsForTargetDate = allRecentFilms.filter(film => film.watchedDateFull === targetDateFormatted);
        if (filmsForTargetDate.length === 0) {
            await interaction.editReply({
                content: `User \`${letterboxdUsername}\` did not watch any movies on ${targetDateEn}.`,
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
                    console.error(`Error fetching TMDB for ${film.title}:`, tmdbError.message);
                }
            }
            filmsWithTmdbDetails.push({ ...film, tmdbDetails });
        }

        const embed = await createDailyDiaryEmbed(filmsWithTmdbDetails, letterboxdUsername, targetDateEn);
        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error(`Error in /diary for ${targetUserTag}:`, error);
        await interaction.editReply({
            content: `Error accessing Letterboxd. Details: ${error.message}`,
        });
    }
}
import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import getRecentDiaryEntries from '../scraper/getDiary.js'; // Assuming getDiary.js is similar to getFullDiary but for recent entries
import { searchMovieTMDB } from '../api/tmdb.js';
import { createDailyDiaryEmbed, formatDateEn } from '../utils/formatEmbed.js'; // Using formatDateEn

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

export const data = new SlashCommandBuilder()
    .setName('diary')
    .setDescription('Shows all movies watched on a specific date on Letterboxd.') // Translated
    .addUserOption(option =>
        option.setName('user') // Changed 'usuario' to 'user'
            .setDescription('Mention another Discord user to view their diary.') // Translated
            .setRequired(false))
    .addIntegerOption(option =>
        option.setName('day') // Translated
            .setDescription('The day (DD) of the watched movies.') // Translated
            .setRequired(false))
    .addIntegerOption(option =>
        option.setName('month') // Translated
            .setDescription('The month (MM) of the watched movies.') // Translated
            .setRequired(false))
    .addIntegerOption(option =>
        option.setName('year') // Translated
            .setDescription('The year (YYYY) of the watched movies.') // Translated
            .setRequired(false));

export async function execute(interaction) {
    let targetDiscordId = interaction.user.id;
    let targetUserTag = interaction.user.tag;

    const mentionedUser = interaction.options.getUser('user'); // Changed 'usuario' to 'user'
    if (mentionedUser) {
        targetDiscordId = mentionedUser.id;
        targetUserTag = mentionedUser.tag;
    }

    const inputDay = interaction.options.getInteger('day'); // Translated
    const inputMonth = interaction.options.getInteger('month'); // Translated
    const inputYear = interaction.options.getInteger('year'); // Translated

    if ((inputDay || inputMonth || inputYear) && !(inputDay && inputMonth && inputYear)) {
        await interaction.reply({
            content: `Please provide the day, month **and** year, or none to use the current date.`, // Translated
            ephemeral: true
        });
        return;
    }

    if (inputDay && inputMonth && inputYear) {
        const testDate = new Date(inputYear, inputMonth - 1, inputDay);
        if (isNaN(testDate.getTime()) || testDate.getDate() !== inputDay || testDate.getMonth() + 1 !== inputMonth || testDate.getFullYear() !== inputYear) {
            await interaction.reply({
                content: `Invalid date provided. Please use a valid date format (e.g., day: 09 month: 07 year: 2025).`, // Translated
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
                console.error(`Error reading users.json: ${readError.message}`); // Translated
                await interaction.editReply({
                    content: 'Internal error fetching user links.', // Translated
                });
                return;
            }
        }

        // Handle both string and object formats for userEntry
        let letterboxdUsername;
        const userEntry = users[targetDiscordId];
        if (typeof userEntry === 'string') {
            letterboxdUsername = userEntry;
        } else if (typeof userEntry === 'object' && userEntry !== null) {
            letterboxdUsername = userEntry.letterboxd;
        }

        if (!letterboxdUsername) {
            await interaction.editReply({
                content: `User ${targetUserTag} has not linked their Letterboxd account yet. Ask them to use \`/link\`!`, // Translated
            });
            return;
        }

        let targetDate = new Date();
        if (inputDay && inputMonth && inputYear) {
            targetDate = new Date(inputYear, inputMonth - 1, inputDay);
        }

        const targetDateFormatted = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
        const targetDateEn = formatDateEn(`${String(targetDate.getDate()).padStart(2, '0')} ${targetDate.toLocaleString('en-US', { month: 'short' })} ${targetDate.getFullYear()}`); // Using formatDateEn

        const allRecentFilms = await getRecentDiaryEntries(letterboxdUsername);
        if (!allRecentFilms || allRecentFilms.length === 0) {
            await interaction.editReply({
                content: `Could not find any movies in \`${letterboxdUsername}\`'s diary or the diary is empty.`, // Translated
            });
            return;
        }

        const filmsForTargetDate = allRecentFilms.filter(film => film.watchedDateFull === targetDateFormatted);
        if (filmsForTargetDate.length === 0) {
            await interaction.editReply({
                content: `User \`${letterboxdUsername}\` did not watch any movies on ${targetDateEn}.`, // Translated
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
                    console.error(`Error fetching TMDB for ${film.title}:`, tmdbError.message); // Translated
                }
            }
            filmsWithTmdbDetails.push({ ...film, tmdbDetails });
        }

        const embed = await createDailyDiaryEmbed(filmsWithTmdbDetails, letterboxdUsername, targetDateEn); // Using targetDateEn
        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error(`Error in /diary for ${targetUserTag}:`, error); // Translated
        await interaction.editReply({
            content: `Error accessing Letterboxd. Details: ${error.message}`, // Translated
        });
    }
}

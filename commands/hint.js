// commands/hint.js (Version with director field - Translated to English)

import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getWatchlist } from '../scraper/getWatchlist.js';
import getFilmDetailsFromSlug from '../scraper/getFilmDetailsFromSlug.js';
import { searchMovieTMDB, getTmdbPosterUrl } from '../api/tmdb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

export const data = new SlashCommandBuilder()
    .setName('hint')
    .setDescription('Suggests a random movie from a user\'s watchlist.') // Translated
    .addUserOption(option =>
        option.setName('user')
        .setDescription('The user to fetch the suggestion for (default: yourself).') // Translated
        .setRequired(false));

export async function execute(interaction) {
    const targetDiscordUser = interaction.options.getUser('user') || interaction.user;
    
    let usersData;
    try {
        usersData = JSON.parse(await fs.readFile(usersFilePath, 'utf8'));
    } catch (error) {
        return interaction.reply({ content: 'Error reading user file.', flags: [MessageFlags.Ephemeral] }); // Translated
    }
    
    // Handle both string and object formats for userEntry
    let letterboxdUsername;
    const userEntry = usersData[targetDiscordUser.id];
    if (typeof userEntry === 'string') {
        letterboxdUsername = userEntry;
    } else if (typeof userEntry === 'object' && userEntry !== null) {
        letterboxdUsername = userEntry.letterboxd;
    }

    if (!letterboxdUsername) {
        const who = targetDiscordUser.id === interaction.user.id ? 'You have not linked' : `User ${targetDiscordUser.displayName} has not linked`; // Translated
        return interaction.reply({ content: `${who} a Letterboxd account. Use /link.`, flags: [MessageFlags.Ephemeral] }); // Translated
    }

    await interaction.deferReply();

    const watchlist = await getWatchlist(letterboxdUsername);

    if (!watchlist || watchlist.length === 0) {
        return interaction.editReply({ content: `${letterboxdUsername}'s watchlist is empty!` }); // Translated
    }

    const randomSlug = watchlist[Math.floor(Math.random() * watchlist.length)];

    try {
        const filmDetails = await getFilmDetailsFromSlug(randomSlug);
        if (!filmDetails) throw new Error('Could not retrieve details for the randomly selected movie from Letterboxd.'); // Translated
        
        const movieDataTMDB = await searchMovieTMDB(filmDetails.title, filmDetails.year);
        if (!movieDataTMDB) throw new Error('Could not find movie details on TMDB.'); // Translated

        const hintEmbed = new EmbedBuilder()
            .setColor(0xF4B740)
            .setTitle(`How about watching: ${filmDetails.title} (${filmDetails.year})?`) // Translated
            .setURL(`https://letterboxd.com/film/${randomSlug}/`)
            .setAuthor({ name: `A suggestion from ${letterboxdUsername}'s watchlist` }) // Translated
            .setDescription(movieDataTMDB.overview || 'Synopsis not available.') // Translated
            .addFields(
                { name: 'Genres', value: movieDataTMDB.genres.join(', ') || 'N/A', inline: true }, // Translated
                { name: 'Director(s)', value: movieDataTMDB.directors.join(', ') || 'N/A', inline: true } // Translated
            )
            .setImage(getTmdbPosterUrl(movieDataTMDB.poster_path, 'w500'))
        
        await interaction.editReply({ content: '', embeds: [hintEmbed] });

    } catch (error) {
        console.error('Error in /hint command:', error); // Translated
        await interaction.editReply({ content: `An error occurred while fetching the suggestion: ${error.message}` }); // Translated
    }
}

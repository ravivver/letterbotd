// commands/favorites.js (Final Version with Stable Public Flow - Translated to English)

import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import getFavorites from '../scraper/getFavorites.js';
import getFilmDetailsFromSlug from '../scraper/getFilmDetailsFromSlug.js';
import { searchMovieTMDB } from '../api/tmdb.js';
import { createFavoritesEmbed } from '../utils/formatEmbed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

export const data = new SlashCommandBuilder()
    .setName('favorites')
    .setDescription('Shows the 4 favorite movies from your Letterboxd profile.') // Translated
    .addUserOption(option =>
        option.setName('user') // Changed 'usuario' to 'user'
            .setDescription('Mention another Discord user to view their favorites.') // Translated
            .setRequired(false));

export async function execute(interaction) {
    // First, defer the interaction PUBLICLY.
    await interaction.deferReply(); 

    let targetDiscordId = interaction.user.id;
    let targetUserTag = interaction.user.tag;

    const mentionedUser = interaction.options.getUser('user'); // Changed 'usuario' to 'user'
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
                console.error(`Error reading users.json: ${readError.message}`); // Translated
                await interaction.editReply({
                    content: 'An internal error occurred while trying to fetch user links. Please try again later.', // Translated
                    flags: MessageFlags.Ephemeral
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
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const favoriteFilmsPreliminary = await getFavorites(letterboxdUsername);

        if (!favoriteFilmsPreliminary || favoriteFilmsPreliminary.length === 0) {
            await interaction.editReply({
                content: `Could not find any favorite movies for \`${letterboxdUsername}\`.`, // Translated
            });
            return;
        }

        const filmsWithTmdbDetails = [];
        let errorsFetchingDetails = false;

        for (const film of favoriteFilmsPreliminary) {
            let preciseFilmDetails = {
                title: film.title,
                year: film.year,
                slug: film.slug,
                url: film.url
            };
            let tmdbDetails = null;

            if (film.slug) {
                const detailsFromSlug = await getFilmDetailsFromSlug(film.slug);
                if (detailsFromSlug) {
                    preciseFilmDetails.title = detailsFromSlug.title;
                    preciseFilmDetails.year = detailsFromSlug.year;
                } else {
                    console.log(`Warning: Could not get precise details for film with slug "${film.slug}". Using preliminary data.`); // Translated
                    errorsFetchingDetails = true;
                }
            } else {
                console.log(`Warning: Slug not available for film "${film.title}". Could not get precise details. Using preliminary data.`); // Translated
                errorsFetchingDetails = true;
            }

            if (preciseFilmDetails.title) {
                try {
                    tmdbDetails = await searchMovieTMDB(preciseFilmDetails.title, preciseFilmDetails.year);
                    if (!tmdbDetails) {
                        console.log(`Warning: TMDB did not find details for "${preciseFilmDetails.title}" (${preciseFilmDetails.year || 'unknown year'}).`); // Translated
                        errorsFetchingDetails = true;
                    }
                } catch (tmdbError) {
                    console.error(`Error fetching TMDB for "${preciseFilmDetails.title}":`, tmdbError.message); // Translated
                    errorsFetchingDetails = true;
                }
            } else {
                console.log(`Warning: Title not available to search TMDB for a favorite film.`); // Translated
                errorsFetchingDetails = true;
            }

            filmsWithTmdbDetails.push({
                ...preciseFilmDetails,
                tmdbDetails
            });
        }

        const { embed, attachment } = await createFavoritesEmbed(filmsWithTmdbDetails, letterboxdUsername);

        if (errorsFetchingDetails) {
            const warningText = '\n\n⚠️ Attention: Some posters or information may be missing/incorrect due to difficulties in obtaining complete film details.'; // Translated
            embed.setDescription((embed.description || '') + warningText);
        }

        // --- STRATEGY OF TWO SEPARATE MESSAGES ---

        // 1. Send the first message with ONLY the embed (editing the initial deferReply)
        await interaction.editReply({
            embeds: [embed],
            // Do not include 'files' here!
        });

        // 2. If there is an attachment (image), send a SECOND message with it using followUp.
        if (attachment) {
            await interaction.followUp({
                files: [attachment],
                // ephemeral: false (followUp is public by default, but can be specified)
            });
        }

    } catch (error) {
        console.error(`General error processing /favorites command for ${targetUserTag}:`, error); // Translated
        let errorMessage = `An error occurred while accessing this user's Letterboxd. Details: ${error.message}`; // Translated
        if (error.message.includes('Profile is Private')) { // Translated
            errorMessage = `The Letterboxd profile of \`${letterboxdUsername}\` is private. Cannot access favorites.`; // Translated
        } else if (error.message.includes('User not found')) { // Translated
            errorMessage = `The Letterboxd user \`${letterboxdUsername}\` was not found.`; // Translated
        } else if (error.message.includes('Could not connect to Letterboxd')) { // Translated
            errorMessage = `Could not connect to Letterboxd. Check bot's connection or try again later.`; // Translated
        }
        await interaction.editReply({
            content: errorMessage,
            flags: MessageFlags.Ephemeral
        });
    }
}

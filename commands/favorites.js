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
    .setDescription('Shows the 4 favorite movies from your Letterboxd profile.')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Mention another Discord user to view their favorites.')
            .setRequired(false));

export async function execute(interaction) {
    await interaction.deferReply(); 

    let targetDiscordId = interaction.user.id;
    let targetUserTag = interaction.user.tag;

    const mentionedUser = interaction.options.getUser('user');
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
                console.error(`Error reading users.json: ${readError.message}`);
                await interaction.editReply({
                    content: 'An internal error occurred while trying to fetch user links. Please try again later.',
                    flags: MessageFlags.Ephemeral
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
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const favoriteFilmsPreliminary = await getFavorites(letterboxdUsername);

        if (!favoriteFilmsPreliminary || favoriteFilmsPreliminary.length === 0) {
            await interaction.editReply({
                content: `Could not find any favorite movies for \`${letterboxdUsername}\`.`,
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
                    console.log(`Warning: Could not get precise details for film with slug "${film.slug}". Using preliminary data.`);
                    errorsFetchingDetails = true;
                }
            } else {
                console.log(`Warning: Slug not available for film "${film.title}". Could not get precise details. Using preliminary data.`);
                errorsFetchingDetails = true;
            }

            if (preciseFilmDetails.title) {
                try {
                    tmdbDetails = await searchMovieTMDB(preciseFilmDetails.title, preciseFilmDetails.year);
                    if (!tmdbDetails) {
                        console.log(`Warning: TMDB did not find details for "${preciseFilmDetails.title}" (${preciseFilmDetails.year || 'unknown year'}).`);
                        errorsFetchingDetails = true;
                    }
                } catch (tmdbError) {
                    console.error(`Error fetching TMDB for "${preciseFilmDetails.title}":`, tmdbError.message);
                    errorsFetchingDetails = true;
                }
            } else {
                console.log(`Warning: Title not available to search TMDB for a favorite film.`);
                errorsFetchingDetails = true;
            }

            filmsWithTmdbDetails.push({
                ...preciseFilmDetails,
                tmdbDetails
            });
        }

        const { embed, attachment } = await createFavoritesEmbed(filmsWithTmdbDetails, letterboxdUsername);

        if (errorsFetchingDetails) {
            const warningText = '\n\n⚠️ Attention: Some posters or information may be missing/incorrect due to difficulties in obtaining complete film details.';
            embed.setDescription((embed.description || '') + warningText);
        }

        await interaction.editReply({
            embeds: [embed],
        });

        if (attachment) {
            await interaction.followUp({
                files: [attachment],
            });
        }

    } catch (error) {
        console.error(`General error processing /favorites command for ${targetUserTag}:`, error);
        let errorMessage = `An error occurred while accessing this user's Letterboxd. Details: ${error.message}`;
        if (error.message.includes('Profile is Private')) {
            errorMessage = `The Letterboxd profile of \`${letterboxdUsername}\` is private. Cannot access favorites.`;
        } else if (error.message.includes('User not found')) {
            errorMessage = `The Letterboxd user \`${letterboxdUsername}\` was not found.`;
        } else if (error.message.includes('Could not connect to Letterboxd')) {
            errorMessage = `Could not connect to Letterboxd. Check bot's connection or try again later.`;
        }
        await interaction.editReply({
            content: errorMessage,
            flags: MessageFlags.Ephemeral
        });
    }
}
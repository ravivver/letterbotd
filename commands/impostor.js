import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url'; 
import { getFullDiary } from '../scraper/getFullDiary.js';
import { searchMovieTMDB, getTmdbPosterUrl } from '../api/tmdb.js';
import { revealImpostorAnswer, createGridImage } from '../utils/formatEmbed.js';
import { searchLetterboxd } from '../scraper/searchLetterboxd.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

const activeImpostorGames = new Map();

const IMPOSTOR_TIMEOUT_MS = 30000;
const NUMBER_OF_OPTIONS = 10;

function normalizeString(str) {
    if (!str) return '';
    return str.toLowerCase()
              .replace(/[^a-z0-9 ]/g, '')
              .replace(/\s+/g, ' ')
              .trim();
}

function getYearFromReleaseDate(releaseDate) {
    if (!releaseDate) return 'N/A';
    try {
        const date = new Date(releaseDate);
        if (isNaN(date.getTime())) {
            return 'N/A';
        }
        return date.getFullYear().toString();
    } catch (e) {
        return 'N/A';
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('impostor')
        .setDescription(`Guess which of ${NUMBER_OF_OPTIONS} movies the user hated! (One is rated 1 star or less)`)
        .addUserOption(option =>
            option.setName('target_user')
                .setDescription('The Discord user whose Letterboxd profile will be used for the game.')
                .setRequired(true)),
    
    async execute(interaction) {
        await interaction.deferReply();

        const channelId = interaction.channel.id;
        const targetDiscordUser = interaction.options.getUser('target_user');

        if (activeImpostorGames.has(channelId)) {
            await interaction.editReply({ content: 'There is already an active Impostor game in this channel. Please wait for it to finish.', ephemeral: true });
            return;
        }

        let usersData = {};
        try {
            usersData = JSON.parse(await fs.readFile(usersFilePath, 'utf8'));
        } catch (e) {
            console.error("Error reading users.json:", e);
            await interaction.editReply({ content: 'An error occurred while loading user data. Please try again later.', ephemeral: true });
            return;
        }

        const getLetterboxdUsername = (discordId) => {
            const userEntry = usersData[discordId];
            if (typeof userEntry === 'string') {
                return userEntry;
            } else if (typeof userEntry === 'object' && userEntry !== null && userEntry.letterboxd) {
                return userEntry.letterboxd;
            }
            return null;
        };

        const targetLetterboxdUsername = getLetterboxdUsername(targetDiscordUser.id);

        if (!targetLetterboxdUsername) {
            await interaction.editReply({ content: `User **${targetDiscordUser.displayName || targetDiscordUser.username}** has not linked a Letterboxd account.`, ephemeral: true });
            return;
        }

        try {
            const initialInteractionReply = await interaction.editReply(`Collecting diary data for **${targetLetterboxdUsername}**...`); 

            const diary = await getFullDiary(targetLetterboxdUsername);

            if (!diary || diary.length === 0) {
                await initialInteractionReply.edit({ content: `Could not retrieve diary for **${targetLetterboxdUsername}** or it is empty.`, ephemeral: true });
                return;
            }

            const lovedFilms = diary.filter(entry => entry.rating >= 4.0);
            const hatedFilms = diary.filter(entry => entry.rating <= 1.0);

            if (hatedFilms.length < 1 || lovedFilms.length < (NUMBER_OF_OPTIONS - 1)) {
                await initialInteractionReply.edit({ content: `The diary of **${targetLetterboxdUsername}** does not contain enough films (at least 1 hated and ${NUMBER_OF_OPTIONS - 1} loved) to start the Impostor game.`, ephemeral: true });
                return;
            }

            const impostorMovieEntry = hatedFilms[Math.floor(Math.random() * hatedFilms.length)];

            const selectedLovedFilms = [];
            const lovedFilmSlugs = new Set(); 
            
            while (selectedLovedFilms.length < (NUMBER_OF_OPTIONS - 1) && lovedFilms.length > selectedLovedFilms.length) {
                const randomIndex = Math.floor(Math.random() * lovedFilms.length);
                const potentialLovedFilm = lovedFilms[randomIndex];
                if (potentialLovedFilm.slug !== impostorMovieEntry.slug && !lovedFilmSlugs.has(potentialLovedFilm.slug)) {
                    selectedLovedFilms.push(potentialLovedFilm);
                    lovedFilmSlugs.add(potentialLovedFilm.slug); 
                }
                if (lovedFilmSlugs.size >= lovedFilms.length && lovedFilms.length < (NUMBER_OF_OPTIONS - 1)) break;
            }
            
            if (selectedLovedFilms.length < (NUMBER_OF_OPTIONS - 1)) {
                 await initialInteractionReply.edit({ content: `Could not find enough unique loved films for **${targetDiscordUser.displayName || targetDiscordUser.username}** to start the Impostor game.`, ephemeral: true });
                 return;
            }

            const allGameMovieEntries = [impostorMovieEntry, ...selectedLovedFilms];
            
            const tmdbMoviePromises = allGameMovieEntries.map(entry => searchMovieTMDB(entry.title, entry.year));
            const tmdbMovies = await Promise.all(tmdbMoviePromises);

            const gameMovies = tmdbMovies.filter(m => 
                m !== null && 
                m.id && 
                m.title && 
                m.overview && 
                m.poster_path
            );
            
            if (gameMovies.length < NUMBER_OF_OPTIONS) { 
                await initialInteractionReply.edit({ content: `Could not get enough details (title, synopsis, poster) from TMDB for ${NUMBER_OF_OPTIONS} films. Please try again later or choose another user.`, ephemeral: true });
                return;
            }

            console.log(`[Impostor Debug] Impostor from Letterboxd: Title='${impostorMovieEntry.title}', Year='${impostorMovieEntry.year}', Rating=${impostorMovieEntry.rating}`);
            console.log(`[Impostor Debug] Normalized Impostor Title: '${normalizeString(impostorMovieEntry.title)}'`);
            console.log(`[Impostor Debug] TMDB Game Movies obtained:`);
            gameMovies.forEach(m => console.log(`  - ${m.title} (${getYearFromReleaseDate(m.release_date)}) - Normalized: '${normalizeString(m.title)}'`));

            let impostorTmdbMovie = gameMovies.find(m => {
                const tmdbYear = getYearFromReleaseDate(m.release_date);
                const lbYear = impostorMovieEntry.year ? impostorMovieEntry.year.toString() : 'N/A';
                return normalizeString(m.title) === normalizeString(impostorMovieEntry.title) && tmdbYear === lbYear;
            });

            if (!impostorTmdbMovie) {
                console.warn(`[Impostor Debug] Impostor match by title+year failed. Trying by title only as fallback.`);
                impostorTmdbMovie = gameMovies.find(m => normalizeString(m.title) === normalizeString(impostorMovieEntry.title));
            }


            if (!impostorTmdbMovie) {
                console.error(`[Impostor Error] Final failure to map impostor. Original LB Entry: ${JSON.stringify(impostorMovieEntry)}. TMDB GameMovies found: ${JSON.stringify(gameMovies.map(m => ({id: m.id, title: m.title, year: getYearFromReleaseDate(m.release_date)})))}`);
                 await initialInteractionReply.edit({ content: `Internal error: Could not map the impostor film to TMDB data. This might occur due to small title or year differences between Letterboxd and TMDB, or if the TMDB search specifically failed for the hated film. Please try again.`, ephemeral: true });
                 return;
            }

            for (let i = gameMovies.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [gameMovies[i], gameMovies[j]] = [gameMovies[j], gameMovies[i]];
            }

            const impostorCustomId = `impostor_game_${channelId}`;

            const selectMenuOptions = gameMovies.map((movie, index) => ({
                label: `${index + 1}. ${movie.title}`,
                value: movie.id.toString(),
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(impostorCustomId)
                .setPlaceholder('Which of these movies did the user hate?');

            if (selectMenuOptions.length > 0) {
                 selectMenu.addOptions(selectMenuOptions);
            } else {
                 await initialInteractionReply.edit({ content: `Could not create select menu options for the game.`, ephemeral: true });
                 return;
            }

            const actionRow = new ActionRowBuilder()
                .addComponents(selectMenu);

            const impostorEmbed = new EmbedBuilder()
                .setColor(0xEE4B2B)
                .setTitle(`🕵️‍♂️ The Impostor Game: Guess ${targetDiscordUser.displayName || targetDiscordUser.username}'s Hated Film! 🕵️‍♀️`)
                .setDescription(`Among the ${NUMBER_OF_OPTIONS} films below, one was rated **1 star or less** by **${targetDiscordUser.displayName || targetDiscordUser.username}** on Letterboxd. The others were rated **4 stars or more**.\n\nChoose the impostor from the menu below! You have **one chance**.\n`);

            const filmsForGridAndLinks = await Promise.all(gameMovies.map(async (movie) => {
                let letterboxdFilmUrl = null;
                const lbSearchResults = await searchLetterboxd(movie.title);
                const lbFilmResult = lbSearchResults.find(r => 
                    r.type === 'film' && 
                    normalizeString(r.title) === normalizeString(movie.title) &&
                    (movie.release_date ? getYearFromReleaseDate(movie.release_date) === getYearFromReleaseDate(r.year) : true)
                );

                if (lbFilmResult) {
                    letterboxdFilmUrl = `https://letterboxd.com/film/${lbFilmResult.slug}/`;
                }
                
                return {
                    title: movie.title,
                    year: getYearFromReleaseDate(movie.release_date),
                    slug: movie.id,
                    posterUrl: getTmdbPosterUrl(movie.poster_path, 'w342'),
                    tmdbUrl: `https://www.themoviedb.org/movie/${movie.id}`,
                    finalUrl: letterboxdFilmUrl || `https://www.themoviedb.org/movie/${movie.id}`
                };
            }));

            const { embed: gridEmbed, attachment: gridAttachment } = await createGridImage(
                filmsForGridAndLinks, 
                `Impostor Game Films for ${targetDiscordUser.displayName || targetDiscordUser.username}`, 
                5,
                2
            );

            impostorEmbed.setImage(`attachment://${gridAttachment.name}`);
            impostorEmbed.setFields([]);

            const impostorMessage = await interaction.editReply({ 
                embeds: [impostorEmbed], 
                components: [actionRow], 
                files: [gridAttachment]
            });

            activeImpostorGames.set(channelId, {
                targetUserId: targetDiscordUser.id,
                correctImpostorMovieId: impostorTmdbMovie.id.toString(),
                timeoutId: setTimeout(async () => {
                    const resultEmbed = revealImpostorAnswer(impostorTmdbMovie, null, false);
                    await impostorMessage.edit({ embeds: [resultEmbed], components: [] }).catch(console.error);
                    activeImpostorGames.delete(channelId);
                }, IMPOSTOR_TIMEOUT_MS),
                guessedUsers: new Set()
            });

            const collectorFilter = i => i.customId === impostorCustomId;
            
            const collector = impostorMessage.createMessageComponentCollector({ filter: collectorFilter, time: IMPOSTOR_TIMEOUT_MS });

            collector.on('collect', async i => {
                const selectedMovieId = i.values[0];
                const session = activeImpostorGames.get(channelId);

                if (!session) { 
                    await i.reply({ content: 'This Impostor game is no longer active.', ephemeral: true });
                    return;
                }

                if (session.guessedUsers.has(i.user.id)) {
                    await i.reply({ content: 'You have already made your guess in this game. Only one chance per player!', ephemeral: true });
                    return;
                }
                session.guessedUsers.add(i.user.id); 

                if (selectedMovieId === session.correctImpostorMovieId) {
                    clearTimeout(session.timeoutId);
                    activeImpostorGames.delete(channelId);

                    const resultEmbed = revealImpostorAnswer(impostorTmdbMovie, i.user, true);
                    
                    await i.update({ embeds: [resultEmbed], components: [] });
                    collector.stop();
                } else {
                    clearTimeout(session.timeoutId);
                    activeImpostorGames.delete(channelId);
                    const resultEmbed = revealImpostorAnswer(impostorTmdbMovie, i.user, false);
                    await i.update({ embeds: [resultEmbed], components: [] });
                    collector.stop();
                }
            });

            collector.on('end', async collected => {
                if (!activeImpostorGames.has(channelId)) return; 

                const session = activeImpostorGames.get(channelId);
                const resultEmbed = revealImpostorAnswer(impostorTmdbMovie, null, false);
                
                await impostorMessage.edit({ embeds: [resultEmbed], components: [] }).catch(console.error);
                activeImpostorGames.delete(channelId);
            });

        } catch (error) {
            console.error(`Error executing /impostor command for ${targetDiscordUser.tag}:`, error);
            let errorMessage = `An error occurred while setting up the Impostor game. Details: ${error.message}`;
            if (error.message.includes('Profile is Private')) {
                errorMessage = `The Letterboxd profile of **${targetLetterboxdUsername}** is private. Cannot access data.`;
            } else if (error.message.includes('User not found')) {
                errorMessage = `The Letterboxd user **${targetLetterboxdUsername}** was not found.`;
            } else if (error.message.includes('Could not get enough details')) { 
                 errorMessage = `Could not find enough loved or hated films with full details to start the game.`;
            } else if (error.message.includes('Could not map the impostor film')) { 
                 errorMessage = `Could not map the impostor film to TMDB data. This may occur due to small title or year differences.`;
            } else if (error.message.includes('Could not connect to Letterboxd')) { 
                errorMessage = `Could not connect to Letterboxd. Check the bot's connection or try again later.`;
            }
            await interaction.editReply({
                content: errorMessage,
                ephemeral: true 
            });
            activeImpostorGames.delete(channelId); 
        }
    }
};
import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } from 'discord.js';
import { discoverMoviesTMDB, getTmdbPosterUrl } from '../api/tmdb.js';
import { createQuizEmbed, revealQuizAnswer } from '../utils/formatEmbed.js';
import { searchLetterboxd } from '../scraper/searchLetterboxd.js';

const activeQuizzes = new Map();

function normalizeString(str) {
    if (!str) return '';
    return str.toLowerCase()
              .replace(/[^a-z0-9]/g, '')
              .replace(/\s+/g, '');
}

export default {
    data: new SlashCommandBuilder()
        .setName('quiz')
        .setDescription('Starts a movie guessing game! Choose the film from a list.'),
    
    async execute(interaction) {
        await interaction.deferReply();

        const channelId = interaction.channel.id;
        const quizCustomId = `movie_quiz_${channelId}`; 

        if (activeQuizzes.has(channelId)) {
            await interaction.editReply({ content: 'There is already an active movie quiz in this channel. Please wait for it to finish or for the time to run out.', ephemeral: true });
            return;
        }

        try {
            const movies = await discoverMoviesTMDB({
                language: 'en-US',
                sortBy: 'popularity.desc',
                voteCountGte: 100
            });

            if (!movies || movies.length === 0) {
                await interaction.editReply('Could not find any movies for the quiz. Please try again later.');
                return;
            }

            const eligibleMovies = movies.filter(movie => movie.overview && movie.poster_path);
            if (eligibleMovies.length < 10) { 
                await interaction.editReply('Not enough suitable movies found for the quiz. Please try again later.');
                return;
            }

            const quizMovie = eligibleMovies[Math.floor(Math.random() * eligibleMovies.length)];
            
            const distractorMovies = [];
            const usedMovieIds = new Set([quizMovie.id]);

            while (distractorMovies.length < 9) {
                const randomIndex = Math.floor(Math.random() * eligibleMovies.length);
                const potentialDistractor = eligibleMovies[randomIndex];

                if (!usedMovieIds.has(potentialDistractor.id)) {
                    distractorMovies.push(potentialDistractor);
                    usedMovieIds.add(potentialDistractor.id);
                }
            }

            const allQuizOptions = [quizMovie, ...distractorMovies];
            for (let i = allQuizOptions.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [allQuizOptions[i], allQuizOptions[j]] = [allQuizOptions[j], allQuizOptions[j]];
            }

            const contentTypeRoll = Math.random();
            let contentType;
            if (contentTypeRoll < 0.4) {
                contentType = 'synopsis';
            } else if (contentTypeRoll < 0.8) {
                contentType = 'poster';
            } else {
                contentType = 'both';
            }

            let letterboxdUrl = null;
            const movieYearForLetterboxd = quizMovie.release_date ? new Date(quizMovie.release_date).getFullYear().toString() : null;
            const letterboxdSearchResults = await searchLetterboxd(quizMovie.title);
            const foundFilmInLetterboxd = letterboxdSearchResults.find(result => {
                const isFilm = result.type === 'film';
                const titleMatches = (result && result.title && quizMovie.title) ? normalizeString(result.title) === normalizeString(quizMovie.title) : false;
                const yearMatches = (movieYearForLetterboxd && result.year === movieYearForLetterboxd) || !result.year;
                return isFilm && titleMatches && yearMatches;
            });

            if (foundFilmInLetterboxd) {
                letterboxdUrl = `https://letterboxd.com/film/${foundFilmInLetterboxd.slug}/`;
            }

            const selectMenuOptions = allQuizOptions.map(movie => ({
                label: `${movie.title} (${new Date(movie.release_date).getFullYear() || 'N/A'})`,
                value: movie.id.toString(),
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(quizCustomId)
                .setPlaceholder('Select your guess...')
                .addOptions(selectMenuOptions);

            const actionRow = new ActionRowBuilder()
                .addComponents(selectMenu);

            const quizEmbed = await createQuizEmbed(quizMovie, contentType, getTmdbPosterUrl);
            const quizMessage = await interaction.editReply({ embeds: [quizEmbed], components: [actionRow] });

            activeQuizzes.set(channelId, quizMovie.id.toString());

            const collectorFilter = i => i.customId === quizCustomId && i.user.id !== interaction.client.user.id;
            
            const collector = quizMessage.createMessageComponentCollector({ filter: collectorFilter, time: 30000 });

            let guessedCorrectly = false;
            let correctGuesser = null;

            collector.on('collect', async i => {
                const selectedMovieId = i.values[0];
                const correctMovieId = activeQuizzes.get(channelId);

                if (selectedMovieId === correctMovieId) {
                    guessedCorrectly = true;
                    correctGuesser = i.user;
                    await i.update({ components: [] });
                    collector.stop();
                } else {
                    await i.reply({ content: 'Incorrect guess! Try again or wait for others.', ephemeral: true });
                }
            });

            collector.on('end', async collected => {
                const finalFilmUrl = letterboxdUrl || `https://www.themoviedb.org/movie/${quizMovie.id}`;

                let finalQuizMessage;
                try {
                    finalQuizMessage = await interaction.channel.messages.fetch(quizMessage.id);
                } catch (fetchError) {
                    console.error(`Error fetching quiz message for update:`, fetchError);
                    finalQuizMessage = quizMessage;
                }

                if (guessedCorrectly) {
                    const resultEmbed = await revealQuizAnswer(quizMovie, correctGuesser, finalFilmUrl, getTmdbPosterUrl);
                    await finalQuizMessage.edit({ embeds: [resultEmbed], components: [] });
                } else {
                    const resultEmbed = await revealQuizAnswer(quizMovie, null, finalFilmUrl, getTmdbPosterUrl);
                    await finalQuizMessage.edit({ embeds: [resultEmbed], components: [] });
                }
                activeQuizzes.delete(channelId);
                console.log(`[Quiz] Quiz ended in channel: ${channelId}. Guessed: ${guessedCorrectly}`);
            });

        } catch (error) {
            console.error(`Error executing /quiz command in channel ${channelId}:`, error);
            await interaction.editReply('An error occurred while setting up the movie quiz. Please try again later.');
            activeQuizzes.delete(channelId);
        }
    }
};
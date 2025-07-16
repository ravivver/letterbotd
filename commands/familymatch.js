// commands/familymatch.js

import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url'; 
import { getFullDiary } from '../scraper/getFullDiary.js';
import { discoverMoviesTMDB, getTmdbGenres, getTmdbPosterUrl } from '../api/tmdb.js';
import { createMovieEmbed } from '../utils/formatEmbed.js'; 

// Resolve __filename and __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

// Map to manage active Family Match sessions per channel
const activeFamilyMatches = new Map(); // channelId -> { ownerId, participants: Set<DiscordUser>, messageId, timeoutId }

// Timeout for the queue (1 minute = 60000 ms)
const QUEUE_TIMEOUT_MS = 60000; 
const MIN_PARTICIPANTS = 2; // Minimum participants to start movie search (owner + 1)
const MAX_PARTICIPANTS = 5; // Maximum participants for Family Match

// Helper function to normalize strings for comparison (useful for movie titles)
function normalizeString(str) {
    if (!str) return '';
    return str.toLowerCase().replace(/[^a-z0-9]/g, ''); // Remove non-alphanumeric and lowercase
}

export default {
    data: new SlashCommandBuilder()
        .setName('familymatch')
        .setDescription('Starts a group movie recommendation session.'),
    
    async execute(interaction) {
        await interaction.deferReply();

        const channelId = interaction.channel.id;
        const ownerId = interaction.user.id;

        // 1. Check if a session is already active in the channel
        if (activeFamilyMatches.has(channelId)) {
            await interaction.editReply({ content: 'There is already an active Family Match session in this channel. Please wait for it to finish or close it.', ephemeral: true });
            return;
        }

        // 2. Create interaction buttons
        const joinButton = new ButtonBuilder()
            .setCustomId('familymatch_join')
            .setLabel('Join Queue')
            .setStyle(ButtonStyle.Primary);

        const closeButton = new ButtonBuilder()
            .setCustomId('familymatch_close')
            .setLabel('Close Queue')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder()
            .addComponents(joinButton, closeButton);

        // 3. Create and send the initial queue message
        const queueEmbed = new EmbedBuilder()
            .setColor(0x0099FF) // Blue
            .setTitle('🎬 Family Match: Queue Open! 🍿')
            .setDescription(`**${interaction.user.displayName || interaction.user.username}** has opened a queue to find a movie for the group!\n\n` +
                            `Click "Join Queue" to participate.\n` +
                            `The queue will automatically close in 1 minute or when ${MAX_PARTICIPANTS} people join.\n\n` +
                            `**Participants (1/${MAX_PARTICIPANTS}):**\n` +
                            `• ${interaction.user.displayName || interaction.user.username} (Initiator)`);

        const queueMessage = await interaction.editReply({ 
            embeds: [queueEmbed], 
            components: [row] 
        });

        // 4. Initialize the session in the active sessions map
        const participants = new Set();
        participants.add(interaction.user); // Add the initiator as the first participant

        const timeoutId = setTimeout(async () => {
            // Logic for when the timeout expires
            const session = activeFamilyMatches.get(channelId);
            if (session) {
                if (session.participants.size < MIN_PARTICIPANTS) {
                    await queueMessage.delete().catch(console.error); // Try to delete the queue message
                    await interaction.followUp({ 
                        content: `The Family Match session in channel ${interaction.channel.name} expired due to insufficient participants (${session.participants.size} out of ${MIN_PARTICIPANTS} required).`, 
                        ephemeral: true 
                    }).catch(console.error);
                } else {
                    // If there are enough participants, start the movie search
                    await findAndRecommendMovie(interaction, session.participants, queueMessage);
                }
                activeFamilyMatches.delete(channelId); // Remove the session from the map
            }
        }, QUEUE_TIMEOUT_MS);

        activeFamilyMatches.set(channelId, {
            ownerId: ownerId,
            participants: participants,
            messageId: queueMessage.id,
            timeoutId: timeoutId
        });

        console.log(`[FamilyMatch] Session started in channel ${channelId} by ${interaction.user.tag}.`);
    }
};

/**
 * Handles the 'Join Queue' button click.
 * @param {ButtonInteraction} interaction The button interaction.
 */
export async function handleJoinButton(interaction) {
    await interaction.deferUpdate(); // Acknowledge the button click immediately

    const channelId = interaction.channel.id;
    const session = activeFamilyMatches.get(channelId);

    if (!session) {
        await interaction.followUp({ content: 'This Family Match session is no longer active.', ephemeral: true });
        return;
    }

    if (session.participants.has(interaction.user)) {
        await interaction.followUp({ content: 'You are already in this queue!', ephemeral: true });
        return;
    }

    if (session.participants.size >= MAX_PARTICIPANTS) {
        await interaction.followUp({ content: 'The Family Match queue is already full!', ephemeral: true });
        return;
    }

    session.participants.add(interaction.user); // Add the user to participants
    console.log(`[FamilyMatch] ${interaction.user.tag} joined the queue in channel ${channelId}.`);

    // Update the queue message
    const currentParticipantsList = Array.from(session.participants).map(u => `• ${u.displayName || u.username}`).join('\n');
    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setDescription(
            `**${interaction.guild.members.cache.get(session.ownerId)?.displayName || 'Someone'}** has opened a queue to find a movie for the group!\n\n` +
            `Click "Join Queue" to participate.\n` +
            `The queue will automatically close in 1 minute or when ${MAX_PARTICIPANTS} people join.\n\n` +
            `**Participants (${session.participants.size}/${MAX_PARTICIPANTS}):**\n` +
            currentParticipantsList
        );

    await interaction.message.edit({ embeds: [updatedEmbed] });

    // If the queue reaches its maximum, start the game
    if (session.participants.size === MAX_PARTICIPANTS) {
        clearTimeout(session.timeoutId); // Cancel the queue timeout
        activeFamilyMatches.delete(channelId); // Remove the session from the map
        await findAndRecommendMovie(interaction, session.participants, interaction.message);
    }
}

/**
 * Handles the 'Close Queue' button click.
 * @param {ButtonInteraction} interaction The button interaction.
 */
export async function handleCloseButton(interaction) {
    await interaction.deferUpdate(); // Acknowledge the button click immediately

    const channelId = interaction.channel.id;
    const userId = interaction.user.id;
    const session = activeFamilyMatches.get(channelId);

    if (!session) {
        await interaction.followUp({ content: 'This Family Match session is no longer active.', ephemeral: true });
        return;
    }

    if (session.ownerId !== userId) {
        await interaction.followUp({ content: 'Only the queue initiator can close it.', ephemeral: true });
        return;
    }

    clearTimeout(session.timeoutId); // Cancel the queue timeout
    activeFamilyMatches.delete(channelId); // Remove the session from the map
    console.log(`[FamilyMatch] Session closed in channel ${channelId} by ${interaction.user.tag}.`);

    if (session.participants.size < MIN_PARTICIPANTS) {
        await interaction.message.edit({ 
            embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setDescription('The Family Match queue was closed, but there were not enough participants to find a movie.')],
            components: [] // Remove buttons
        });
        await interaction.followUp({ content: 'The queue was closed, but there were not enough participants to find a movie.', ephemeral: true });
    } else {
        await findAndRecommendMovie(interaction, session.participants, interaction.message);
    }
}

// --- Movie search and recommendation logic ---
async function findAndRecommendMovie(interaction, participants, queueMessage) {
    await queueMessage.edit({ 
        embeds: [EmbedBuilder.from(queueMessage.embeds[0]).setDescription('Queue closed! Searching for the ideal movie for the group... This might take a while.')],
        components: [] // Remove buttons
    });

    console.log(`[FamilyMatch] Starting movie search for ${participants.size} participants in channel ${interaction.channel.id}.`);
    
    let usersData = {};
    try {
        usersData = JSON.parse(await fs.readFile(usersFilePath, 'utf8')); //
    } catch (e) {
        console.error("Error reading users.json in findAndRecommendMovie:", e);
        await queueMessage.edit({ content: 'An error occurred while loading user data. Please try again later.', components: [] });
        return;
    }

    const letterboxdUsernames = [];
    const missingLbUsers = [];
    const allUserDiaries = []; // Will store diaries of all participants with Letterboxd accounts

    for (const user of participants) {
        const userEntry = usersData[user.id]; //
        let lbUsername = null;
        if (typeof userEntry === 'string') {
            lbUsername = userEntry;
        } else if (typeof userEntry === 'object' && userEntry !== null && userEntry.letterboxd) {
            lbUsername = userEntry.letterboxd; //
        }

        if (lbUsername) {
            letterboxdUsernames.push(lbUsername);
            try {
                const diary = await getFullDiary(lbUsername); //
                if (diary && diary.length > 0) {
                    allUserDiaries.push({ username: lbUsername, diary: diary });
                } else {
                    console.warn(`[FamilyMatch] Diary for ${lbUsername} is empty or could not be fetched.`);
                }
            } catch (diaryError) {
                console.error(`[FamilyMatch] Error fetching diary for ${lbUsername}:`, diaryError);
                // We don't add it to the diaries list, but the process can continue for others
            }
        } else {
            missingLbUsers.push(user.displayName || user.username);
        }
    }

    // If fewer participants have Letterboxd accounts than the minimum, terminate.
    if (allUserDiaries.length < MIN_PARTICIPANTS) {
        let msg = `Could not find an ideal movie. At least ${MIN_PARTICIPANTS} participants need to have linked Letterboxd accounts.`;
        if (missingLbUsers.length > 0) {
            msg += `\nUsers without a linked Letterboxd account or empty diary: ${missingLbUsers.join(', ')}.`;
        }
        await queueMessage.edit({ content: msg, components: [] });
        return;
    }

    // --- Collect all movies already watched by the group ---
    const allWatchedNormalizedTitles = new Set();
    const genreCounts = new Map(); // To count genre frequency
    const allGenres = await getTmdbGenres(); //
    const genreMap = new Map(allGenres.map(g => [g.id, g.name]));

    for (const userDiary of allUserDiaries) {
        userDiary.diary.forEach(entry => {
            if (entry.title) {
                allWatchedNormalizedTitles.add(normalizeString(entry.title)); //
            }
        });
    }

    // --- Search for candidate movies ---
    let recommendedMovie = null;
    let currentPage = 1;
    const maxPagesToSearch = 5; // Limits the search to X pages to avoid overloading the API

    while (!recommendedMovie && currentPage <= maxPagesToSearch) {
        const candidates = await discoverMoviesTMDB({
            sortBy: 'popularity.desc',
            voteCountGte: 50, // Ensures reasonably popular movies
            page: currentPage
        }); //

        if (!candidates || candidates.length === 0) break;

        for (const candidate of candidates) {
            const normalizedCandidateTitle = normalizeString(candidate.title);
            
            // Check if the movie has already been watched by anyone in the group
            const isAlreadyWatched = allWatchedNormalizedTitles.has(normalizedCandidateTitle);
            
            if (!isAlreadyWatched) {
                // We found a movie that no one has watched yet!
                recommendedMovie = candidate;
                break;
            }
        }
        currentPage++;
    }

    // --- Present the result ---
    if (recommendedMovie) {
        const posterUrl = getTmdbPosterUrl(recommendedMovie.poster_path, 'w500'); //
        const genreNames = recommendedMovie.genre_ids ? recommendedMovie.genre_ids.map(id => genreMap.get(id) || 'Unknown Genre') : [];

        const participantsUsernames = Array.from(participants).map(u => u.displayName || u.username);
        
        // We can use createMovieEmbed to display the movie
        const embed = createMovieEmbed(recommendedMovie, posterUrl, genreNames, `https://www.themoviedb.org/movie/${recommendedMovie.id}`); 
        
        embed.setTitle(`🎬 Family Match: Your Ideal Movie! 🍿`);
        embed.setDescription(`Here's a movie recommendation for the group:\n\n${embed.data.description}`);
        embed.addFields(
            { name: 'Participants', value: participantsUsernames.join(', '), inline: false },
            { name: 'Why this movie?', value: 'This movie is a popular choice that none of the participants have watched yet.', inline: false }
        );

        await queueMessage.edit({ embeds: [embed], components: [] });
    } else {
        await queueMessage.edit({ 
            content: `Could not find an ideal movie for the group among the ${maxPagesToSearch} pages of popular movies that no one has watched yet. Try with other participants or criteria.`, 
            components: [] 
        });
    }
}
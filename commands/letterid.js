// commands/letterid.js

import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url'; 
import getProfileStats from '../scraper/getProfileStats.js'; 
import { getFullDiary } from '../scraper/getFullDiary.js'; 
import { createLetterIDEmbed } from '../utils/formatEmbed.js'; 
// import { convertRatingToStars } from '../utils/formatEmbed.js'; // Uncomment if you want to use stars for mostCommonRating

// Resolve __filename and __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Define the path to the users.json storage file
const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

// Array of movie quotes for the ID card
const movieQuotes = [
    "Here's looking at you, kid. - Casablanca",
    "May the Force be with you. - Star Wars",
    "E.T. phone home. - E.T. the Extra-Terrestrial",
    "There's no place like home. - The Wizard of Oz",
    "I'll be back. - The Terminator",
    "Frankly, my dear, I don't give a damn. - Gone with the Wind",
    "Bond. James Bond. - Dr. No",
    "Go ahead, make my day. - Sudden Impact",
    "Yippee-ki-yay, motherfucker. - Die Hard",
    "I'm gonna make him an offer he can't refuse. - The Godfather",
    "Houston, we have a problem. - Apollo 13",
    "Elementary, my dear Watson. - The Adventures of Sherlock Holmes",
    "I'll have what she's having. - When Harry Met Sally...",
    "There's no crying in baseball! - A League of Their Own",
    "To infinity and beyond! - Toy Story"
];

/**
 * Returns a random movie quote from the predefined list.
 * @returns {string} A random movie quote.
 */
function getRandomQuote() {
    return movieQuotes[Math.floor(Math.random() * movieQuotes.length)];
}

export default {
    // Command data: name, description, and options
    data: new SlashCommandBuilder()
        .setName('letterid')
        .setDescription('Generates your Letterboxd Cinephile ID Card.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The Discord user whose ID card you want to see (defaults to yourself).')
                .setRequired(false)),
    
    // Command execution logic
    async execute(interaction) {
        await interaction.deferReply(); // Acknowledge interaction quickly

        // Determine the target Discord user (either specified or the interaction user)
        const targetDiscordUser = interaction.options.getUser('user') || interaction.user;
        
        let usersData = {};
        try {
            // Read user data from the JSON file
            usersData = JSON.parse(await fs.readFile(usersFilePath, 'utf8'));
        } catch (e) {
            console.error("Error reading users.json:", e);
            // If file doesn't exist or is empty, usersData remains {}
        }
        
        // Retrieve the Letterboxd username for the target Discord user
        const userEntry = usersData[targetDiscordUser.id];
        let letterboxdUsername;

        if (typeof userEntry === 'string') {
            letterboxdUsername = userEntry;
        } else if (typeof userEntry === 'object' && userEntry !== null && userEntry.letterboxd) {
            letterboxdUsername = userEntry.letterboxd;
        }

        // If no Letterboxd account is linked for the user, inform them
        if (!letterboxdUsername) {
            const who = targetDiscordUser.id === interaction.user.id ? 'You have not linked' : `User ${targetDiscordUser.displayName} has not linked`;
            await interaction.editReply({ content: `${who} a Letterboxd account. Use /link to link your account.`, ephemeral: true });
            return;
        }

        try {
            // Fetch profile statistics from Letterboxd
            const profileStats = await getProfileStats(letterboxdUsername);

            if (!profileStats) {
                await interaction.editReply({
                    content: `Could not retrieve profile statistics for \`${letterboxdUsername}\`.`,
                });
                return;
            }

            // Fetch full diary to calculate the most common rating
            const fullDiary = await getFullDiary(letterboxdUsername);
            let mostCommonRating = 'N/A';
            if (fullDiary && fullDiary.length > 0) {
                const ratingCounts = {};
                // Count occurrences of each rating
                fullDiary.forEach(entry => {
                    if (entry.rating !== null && entry.rating !== undefined) {
                        const ratingString = entry.rating.toString();
                        ratingCounts[ratingString] = (ratingCounts[ratingString] || 0) + 1;
                    }
                });
                
                let maxCount = 0;
                let commonRating = null;
                // Find the rating with the highest count
                for (const rating in ratingCounts) {
                    if (ratingCounts[rating] > maxCount) {
                        maxCount = ratingCounts[rating];
                        commonRating = rating;
                    }
                }
                // Format the most common rating (e.g., "3.5 stars")
                mostCommonRating = commonRating !== null ? `${parseFloat(commonRating)} stars` : 'N/A';
                // If you want to use stars emoji, uncomment the line below and the import at the top:
                // mostCommonRating = commonRating !== null ? convertRatingToStars(parseFloat(commonRating)) : 'N/A';
            }

            // Select a random movie quote for the ID card
            const randomQuote = getRandomQuote();

            // Prepare data for the ID card embed
            const cardData = {
                username: letterboxdUsername,
                avatarUrl: profileStats.userAvatarUrl,
                totalFilms: profileStats.totalFilmsWatched,
                filmsThisYear: profileStats.filmsThisYear,
                followers: profileStats.followers,
                following: profileStats.following,
                watchlistCount: profileStats.watchlistCount,
                mostCommonRating: mostCommonRating,
                randomQuote: randomQuote,
                profileUrl: profileStats.profileUrl
            };

            // Generate the ID card embed and attachment (image)
            const { embed, attachment } = await createLetterIDEmbed(cardData);

            // Prepare reply options, including the image attachment if available
            const replyOptions = { embeds: [embed] };
            if (attachment) {
                replyOptions.files = [attachment];
            }
            await interaction.editReply(replyOptions);

        } catch (error) {
            console.error(`Error processing /letterid command for ${targetDiscordUser.tag}:`, error);
            let errorMessage = `An error occurred while accessing this user's Letterboxd profile. Details: ${error.message}`;
            // Provide more specific error messages based on the error type
            if (error.message.includes('Profile is Private')) {
                errorMessage = `The Letterboxd profile of \`${letterboxdUsername}\` is private. Cannot access data.`;
            } else if (error.message.includes('User not found')) {
                errorMessage = `The Letterboxd user \`${letterboxdUsername}\` was not found.`;
            } else if (error.message.includes('Could not connect to Letterboxd')) {
                errorMessage = `Could not connect to Letterboxd. Check the bot's connection or try again later.`;
            }
            await interaction.editReply({
                content: errorMessage,
                flags: MessageFlags.Ephemeral // Only visible to the user who ran the command
            });
        }
    }
};
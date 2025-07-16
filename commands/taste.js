// commands/taste.js

import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url'; 
import { getFullDiary } from '../scraper/getFullDiary.js';
import { createTasteEmbed } from '../utils/formatEmbed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

export default {
    data: new SlashCommandBuilder()
        .setName('taste')
        .setDescription('Compares film taste compatibility between two Letterboxd users.')
        .addUserOption(option => 
            option.setName('user2')
                .setDescription('The second Discord user to compare with.')
                .setRequired(true))
        .addUserOption(option => 
            option.setName('user1')
                .setDescription('The first Discord user (defaults to yourself).')
                .setRequired(false)), 
    
    async execute(interaction) {
        await interaction.deferReply();

        const discordUser1 = interaction.options.getUser('user1') || interaction.user;
        const discordUser2 = interaction.options.getUser('user2');

        if (discordUser1.id === discordUser2.id) {
            await interaction.editReply({ content: 'Please select two different users to compare.', ephemeral: true });
            return;
        }

        let usersData = {};
        try {
            usersData = JSON.parse(await fs.readFile(usersFilePath, 'utf8')); //
        } catch (e) {
            console.error("Error reading users.json:", e);
            await interaction.editReply({ content: 'An error occurred while loading user data. Please try again later.', ephemeral: true });
            return;
        }

        
        const getLetterboxdUsername = (discordId) => {
            const userEntry = usersData[discordId]; //
            if (typeof userEntry === 'string') {
                return userEntry;
            } else if (typeof userEntry === 'object' && userEntry !== null && userEntry.letterboxd) {
                return userEntry.letterboxd; //
            }
            return null;
        };

        const letterboxdUsername1 = getLetterboxdUsername(discordUser1.id);
        const letterboxdUsername2 = getLetterboxdUsername(discordUser2.id);

        if (!letterboxdUsername1) {
            await interaction.editReply({ content: `User **${discordUser1.displayName || discordUser1.username}** has not linked a Letterboxd account. Use \`/link\` to link.`, ephemeral: true });
            return;
        }
        if (!letterboxdUsername2) {
            await interaction.editReply({ content: `User **${discordUser2.displayName || discordUser2.username}** has not linked a Letterboxd account.`, ephemeral: true });
            return;
        }

        try {
            await interaction.editReply(`Fetching diary data for **${letterboxdUsername1}** and **${letterboxdUsername2}**... This might take a moment if they have large diaries.`);

            // Fetch full diaries for both users
            const [diary1, diary2] = await Promise.all([
                getFullDiary(letterboxdUsername1), //
                getFullDiary(letterboxdUsername2) //
            ]);

            if (!diary1 || diary1.length === 0) {
                await interaction.editReply({ content: `Could not retrieve diary for **${letterboxdUsername1}** or it's empty.`, ephemeral: true });
                return;
            }
            if (!diary2 || diary2.length === 0) {
                await interaction.editReply({ content: `Could not retrieve diary for **${letterboxdUsername2}** or it's empty.`, ephemeral: true });
                return;
            }

            // --- Compatibility Calculation Logic ---
            const user1Ratings = new Map();
            diary1.forEach(entry => {
                if (entry.rating !== null && entry.slug) {
                    user1Ratings.set(entry.slug, entry.rating); //
                }
            });

            const commonFilms = []; // Films that both have watched and rated
            const ratingDifferences = []; // Rating differences for common films

            diary2.forEach(entry => {
                if (entry.rating !== null && entry.slug && user1Ratings.has(entry.slug)) {
                    const ratingUser1 = user1Ratings.get(entry.slug); //
                    const ratingUser2 = entry.rating; //
                    
                    const diff = Math.abs(ratingUser1 - ratingUser2);
                    ratingDifferences.push(diff);
                    commonFilms.push({
                        slug: entry.slug, //
                        title: entry.title, //
                        year: entry.year, //
                        rating1: ratingUser1,
                        rating2: ratingUser2,
                        difference: diff
                    });
                }
            });

            let compatibilityPercentage = 0;
            if (commonFilms.length === 0) {
                compatibilityPercentage = 0;
            } else {
                const totalDifference = ratingDifferences.reduce((sum, diff) => sum + diff, 0);
                const averageDifference = totalDifference / ratingDifferences.length;

                // Letterboxd ratings go from 0.5 to 5, so max difference is 4.5
                const maxPossibleDifference = 4.5; 
                compatibilityPercentage = Math.max(0, 100 - (averageDifference / maxPossibleDifference) * 100);
            }
            
            // Round the percentage to two decimal places
            compatibilityPercentage = parseFloat(compatibilityPercentage.toFixed(2));

            // For the embed, we can take the 3 films with the smallest difference and the 3 with the largest difference
            commonFilms.sort((a, b) => a.difference - b.difference);
            const mostAgreedFilms = commonFilms.slice(0, 3);
            const mostDisagreedFilms = commonFilms.slice().reverse().slice(0, 3);


            // Create and send the result embed
            const embed = createTasteEmbed(
                discordUser1.displayName || discordUser1.username,
                discordUser2.displayName || discordUser2.username,
                letterboxdUsername1,
                letterboxdUsername2,
                compatibilityPercentage,
                commonFilms.length,
                mostAgreedFilms,
                mostDisagreedFilms
            );

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(`Error executing /taste command for ${discordUser1.tag} and ${discordUser2.tag}:`, error);
            let errorMessage = `An error occurred while comparing film tastes. Details: ${error.message}`;
            if (error.message.includes('Profile is Private')) {
                errorMessage = `One of the Letterboxd profiles is private. Cannot access data.`;
            } else if (error.message.includes('User not found')) {
                errorMessage = `One of the Letterboxd users was not found.`;
            } else if (error.message.includes('Could not connect to Letterboxd')) {
                errorMessage = `Could not connect to Letterboxd. Check the bot's connection or try again later.`;
            }
            await interaction.editReply({
                content: errorMessage,
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
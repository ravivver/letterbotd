// commands/profile.js

import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url'; 
import getProfileStats from '../scraper/getProfileStats.js'; 
import { createProfileEmbed } from '../utils/formatEmbed.js'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

export const data = new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Shows a user\'s Letterboxd profile statistics.') // Translated
    .addUserOption(option =>
        option.setName('user') // Changed 'usuario' to 'user'
            .setDescription('Mention another Discord user to view their profile.') // Translated
            .setRequired(false));

export async function execute(interaction) {
    await interaction.deferReply(); // Public deferral by default

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
                    content: 'An internal error occurred while fetching user links. Please try again later.', // Translated
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

        // Call the scraper to get profile statistics
        const profileStats = await getProfileStats(letterboxdUsername);

        if (!profileStats) {
            await interaction.editReply({
                content: `Could not retrieve profile statistics for \`${letterboxdUsername}\`.`, // Translated
            });
            return;
        }

        // Create the embed with statistics
        const { embed } = await createProfileEmbed(profileStats, letterboxdUsername);

        // Send the embed (editing the initial deferReply)
        await interaction.editReply({
            embeds: [embed],
        });

    } catch (error) {
        console.error(`Error processing /profile command for ${targetUserTag}:`, error); // Translated
        let errorMessage = `An error occurred while accessing this user's Letterboxd profile. Details: ${error.message}`; // Translated
        if (error.message.includes('Profile is Private')) { // Translated
            errorMessage = `The Letterboxd profile of \`${letterboxdUsername}\` is private. Cannot access statistics.`; // Translated
        } else if (error.message.includes('User not found')) { // Translated
            errorMessage = `The Letterboxd user \`${letterboxdUsername}\` was not found.`; // Translated
        } else if (error.message.includes('Could not connect to Letterboxd')) { // Translated
            errorMessage = `Could not connect to Letterboxd. Check the bot's connection or try again later.`; // Translated
        }
        await interaction.editReply({
            content: errorMessage,
            flags: MessageFlags.Ephemeral
        });
    }
}

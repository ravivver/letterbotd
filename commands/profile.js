import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url'; 
import ProfileScrapers from '../scraper/getProfileStats.js'; 
import { createProfileEmbed } from '../utils/formatEmbed.js'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

export const data = new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Shows a user\'s Letterboxd profile statistics.')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Mention another Discord user to view their profile.')
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
                    content: 'An internal error occurred while fetching user links. Please try again later.',
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


        const profileStats = await ProfileScrapers.getProfileStats(letterboxdUsername);

        if (!profileStats) {
            await interaction.editReply({
                content: `Could not retrieve profile statistics for \`${letterboxdUsername}\`.`,
            });
            return;
        }

        const { embed } = await createProfileEmbed(profileStats, letterboxdUsername);

        await interaction.editReply({
            embeds: [embed],
        });

    } catch (error) {
        console.error(`Error processing /profile command for ${targetUserTag}:`, error);
        let errorMessage = `An error occurred while accessing this user's Letterboxd profile. Details: ${error.message}`;
        if (error.message.includes('Profile is Private')) {
            errorMessage = `The Letterboxd profile of \`${letterboxdUsername}\` is private. Cannot access statistics.`;
        } else if (error.message.includes('User not found')) {
            errorMessage = `The Letterboxd user \`${letterboxdUsername}\` was not found.`;
        } else if (error.message.includes('Could not connect to Letterboxd')) {
            errorMessage = `Could not connect to Letterboxd. Check the bot's connection or try again later.`;
        }
        await interaction.editReply({
            content: errorMessage,
            flags: MessageFlags.Ephemeral
        });
    }
}
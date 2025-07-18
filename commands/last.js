import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import getRecentDiaryEntries from '../scraper/getDiary.js';
import { searchMovieTMDB } from '../api/tmdb.js';
import { createDiaryEmbed } from '../utils/formatEmbed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

export const data = new SlashCommandBuilder()
    .setName('last')
    .setDescription('Shows the last movie watched on a user\'s Letterboxd profile.')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Mention another Discord user to view their last movie.')
            .setRequired(false));

export async function execute(interaction) {
    await interaction.deferReply();

    let targetDiscordId = interaction.options.getUser('user')?.id || interaction.user.id;
    const targetUser = interaction.options.getUser('user') || interaction.user;

    try {
        let users = {};
        try {
            const data = await fs.readFile(usersFilePath, 'utf8');
            users = JSON.parse(data);
        } catch (readError) {
            if (readError.code !== 'ENOENT') {
                console.error(`Error reading users.json: ${readError.message}`);
                return interaction.editReply({ content: 'An internal error occurred while fetching user links.', flags: [MessageFlags.Ephemeral] });
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
            const who = targetUser.id === interaction.user.id ? 'You have not linked your account' : `User ${targetUser.displayName} has not linked their account`;
            return interaction.editReply({ content: `${who} Letterboxd. Use /link.`, flags: [MessageFlags.Ephemeral] });
        }

        const films = await getRecentDiaryEntries(letterboxdUsername);

        if (!films || films.length === 0) {
            return interaction.editReply({ content: `Could not find any movies in \`${letterboxdUsername}\`'s diary or the diary is empty.` });
        }

        const latestFilm = films[0];

        if (!latestFilm || !latestFilm.title || !latestFilm.url) {
            console.error('Scraping error: The returned latest film object is invalid.', latestFilm);
            return interaction.editReply({ content: 'Could not extract details for the last movie from the diary. Letterboxd page format might have changed.', flags: [MessageFlags.Ephemeral] });
        }

        let tmdbDetails = null;
        if (latestFilm.title && latestFilm.year) {
            try {
                tmdbDetails = await searchMovieTMDB(latestFilm.title, latestFilm.year);
            } catch (tmdbError) {
                console.error(`Error fetching TMDB for ${latestFilm.title}:`, tmdbError.message);
            }
        }

        const embed = await createDiaryEmbed(latestFilm, tmdbDetails, letterboxdUsername);

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error(`Error processing /last command for ${targetUser.tag}:`, error);
        let errorMessage = `An error occurred while fetching data from Letterboxd. Check if the profile is public and the username is correct. Details: ${error.message}`;
        if (error.message.includes('Profile is Private')) {
            errorMessage = `The Letterboxd profile of \`${letterboxdUsername}\` is private. Cannot access the last watched film.`;
        } else if (error.message.includes('User not found')) {
            errorMessage = `The Letterboxd user \`${letterboxdUsername}\` was not found.`;
        } else if (error.message.includes('Could not connect to Letterboxd')) {
            errorMessage = `Could not connect to Letterboxd. Check the bot's connection or try again later.`;
        }
        await interaction.editReply({
            content: errorMessage,
            flags: [MessageFlags.Ephemeral]
        });
    }
}
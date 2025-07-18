import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import fs from 'node:fs/promises'; 
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkUserExists } from '../scraper/checkUserExists.js'; 
import { getFullDiary } from '../scraper/getFullDiary.js'; 
import { saveDiaryEntries } from '../database/db.js'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

export const data = new SlashCommandBuilder()
    .setName('link')
    .setDescription('Associates your Discord ID with a Letterboxd username.')
    .addStringOption(option =>
        option.setName('username')
            .setDescription('Your Letterboxd username (e.g., your_username)')
            .setRequired(true));

export async function execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }); 

    const letterboxdUsername = interaction.options.getString('username').trim();
    const discordId = interaction.user.id;
    const guildId = interaction.guildId;

    if (!guildId) {
        await interaction.editReply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
        return;
    }

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
                content: 'An internal error occurred while trying to read user links. Please try again later.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }
    }

    for (const id in users) {
        let linkedUsername;
        if (typeof users[id] === 'string') {
            linkedUsername = users[id];
        } else if (typeof users[id] === 'object' && users[id] !== null) {
            linkedUsername = users[id].letterboxd;
        }

        if (linkedUsername && linkedUsername.toLowerCase() === letterboxdUsername.toLowerCase() && id !== discordId) {
            await interaction.editReply({
                content: `The username \`${letterboxdUsername}\` is already linked to another Discord account. Please contact an administrator to resolve this.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }
    }

    const verification = await checkUserExists(letterboxdUsername);

    if (verification.status !== 'SUCCESS') {
        await interaction.editReply({ 
            content: `Could not link: ${verification.message}`,
            flags: MessageFlags.Ephemeral
        });
        return; 
    }

    try {
        users[discordId] = {
            letterboxd: letterboxdUsername,
            last_sync_date: null 
        };

        await fs.writeFile(usersFilePath, JSON.stringify(users, null, 4), 'utf8');

        await interaction.editReply({
            content: `Your Discord account has been successfully linked to the Letterboxd profile: \`${letterboxdUsername}\`. Initiating initial diary synchronization... This may take a few minutes!`,
            flags: MessageFlags.Ephemeral
        });

        try {
            const diaryEntries = await getFullDiary(letterboxdUsername); 

            if (!diaryEntries || diaryEntries.length === 0) {
                await interaction.followUp({ content: 'Your Letterboxd diary appears to be empty or has no entries. Nothing to sync initially.', flags: MessageFlags.Ephemeral });
            } else {
                const { changes } = await saveDiaryEntries(diaryEntries.map(entry => ({
                    ...entry,
                    discord_id: discordId,
                    letterboxd_username: letterboxdUsername,
                    guild_id: guildId
                })));
                
                users[discordId].last_sync_date = new Date().toISOString();
                await fs.writeFile(usersFilePath, JSON.stringify(users, null, 4));

                await interaction.followUp({ 
                    content: `Initial synchronization complete! (${changes} new entries were added to the database).`,
                    flags: MessageFlags.Ephemeral
                });
            }
        } catch (syncError) {
            console.error(`Error during initial /link synchronization for ${letterboxdUsername}:`, syncError);
            await interaction.followUp({
                content: `An error occurred during the initial synchronization of your diary: ${syncError.message}. You can try using \`/sync\` later.`,
                flags: MessageFlags.Ephemeral
            });
        }

    } catch (error) {
        console.error(`Error linking user ${discordId} with ${letterboxdUsername}:`, error);
        await interaction.editReply({
            content: `An error occurred while linking your Letterboxd account. Details: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}
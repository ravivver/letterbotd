import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import fs from 'node:fs/promises'; 
import path from 'node:path';
import { fileURLToPath } from 'node:url'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

export const data = new SlashCommandBuilder()
    .setName('unlink')
    .setDescription('Unlinks your Letterboxd account from the bot.');

export async function execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }); 

    const discordId = interaction.user.id;
    const userTag = interaction.user.tag;

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
                    content: 'An internal error occurred while trying to read user links. Please try again later.',
                    flags: MessageFlags.Ephemeral 
                });
                return;
            }
        }

        if (users[discordId]) {
            delete users[discordId]; 
            await fs.writeFile(usersFilePath, JSON.stringify(users, null, 2), 'utf8'); 

            await interaction.editReply({
                content: `Your Letterboxd account has been successfully unlinked!`,
                flags: MessageFlags.Ephemeral 
            });
        } else {
            await interaction.editReply({
                content: `You do not have a Letterboxd account linked to unlink. Use \`/link\` to link one.`,
                flags: MessageFlags.Ephemeral 
            });
        }

    } catch (error) {
        console.error(`Error processing /unlink command for ${userTag}:`, error);
        await interaction.editReply({
            content: `An unexpected error occurred while unlinking your account. Details: ${error.message}`,
            flags: MessageFlags.Ephemeral 
        });
    }
}
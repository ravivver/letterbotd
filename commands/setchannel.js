import { SlashCommandBuilder, PermissionsBitField, MessageFlags } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const guildConfigsPath = path.join(__dirname, '..', 'storage', 'guild_configs.json');

export const data = new SlashCommandBuilder()
    .setName('setchannel')
    .setDescription('Sets the channel for daily watched film notifications.')
    .addChannelOption(option =>
        option.setName('channel')
            .setDescription('The channel to send daily watch notifications to.')
            .setRequired(true));

export async function execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: 'You need Administrator permissions to use this command.', ephemeral: true });
    }

    const channel = interaction.options.getChannel('channel');
    const guildId = interaction.guildId;

    if (!guildId) {
        return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    }

    if (!channel || channel.type !== 0) {
        return interaction.reply({ content: 'Please select a valid text channel.', ephemeral: true });
    }

    let guildConfigs = {};
    try {
        const data = await fs.readFile(guildConfigsPath, 'utf8');
        if (data.trim() === '') {
            console.log('[setchannel] Guild configurations file is empty. Initializing with empty configs.');
            guildConfigs = {};
        } else {
            guildConfigs = JSON.parse(data);
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            guildConfigs = {};
        } else if (error instanceof SyntaxError) {
            console.error('[setchannel] Error parsing guild configurations JSON (file might be empty or corrupted). Initializing with empty configs:', error.message);
            guildConfigs = {};
        } else {
            console.error(`Error reading guild_configs.json: ${error.message}`);
            return interaction.reply({ content: 'An internal error occurred while reading server configurations. Please try again later.', ephemeral: true });
        }
    }

    guildConfigs[guildId] = {
        notification_channel_id: channel.id
    };

    try {
        await fs.writeFile(guildConfigsPath, JSON.stringify(guildConfigs, null, 2), 'utf8');
        await interaction.reply({ content: `Daily watch notifications will now be sent to ${channel}.`, ephemeral: true });
        console.log(`[Config] Notification channel for guild ${guildId} set to ${channel.id}.`);
    } catch (error) {
        console.error(`Error saving guild config for ${guildId}: ${error.message}`);
        await interaction.reply({ content: 'An error occurred while saving the channel configuration. Please try again later.', ephemeral: true });
    }
}
import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getFullDiary } from '../scraper/getFullDiary.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

const ITEMS_PER_PAGE = 10;

export const data = new SlashCommandBuilder()
    .setName('compare')
    .setDescription('Compares watched movies between two users.')
    .addUserOption(option =>
        option.setName('user1')
        .setDescription('The first user to compare.')
        .setRequired(true))
    .addUserOption(option =>
        option.setName('user2')
        .setDescription('The second user to compare (default: yourself).')
        .setRequired(false));

export async function execute(interaction) {
    const user1 = interaction.options.getUser('user1');
    const user2 = interaction.options.getUser('user2') || interaction.user;

    if (user1.id === user2.id) {
        return interaction.reply({ content: 'You cannot compare yourself with yourself!', flags: [MessageFlags.Ephemeral] });
    }

    let usersData;
    try {
        usersData = JSON.parse(await fs.readFile(usersFilePath, 'utf8'));
    } catch (error) {
        return interaction.reply({ content: 'Error reading user file.', flags: [MessageFlags.Ephemeral] });
    }

    const getLbUsername = (discordUser) => {
        const entry = usersData[discordUser.id];
        if (typeof entry === 'string') return entry;
        if (typeof entry === 'object' && entry !== null) return entry.letterboxd;
        return null;
    };

    const lbUser1 = getLbUsername(user1);
    const lbUser2 = getLbUsername(user2);

    if (!lbUser1) return interaction.reply({ content: `User ${user1.displayName} has not linked an account.`, flags: [MessageFlags.Ephemeral] });
    if (!lbUser2) return interaction.reply({ content: `User ${user2.displayName} has not linked an account.`, flags: [MessageFlags.Ephemeral] });

    await interaction.deferReply();
    await interaction.editReply(`Fetching and comparing diaries of **${lbUser1}** and **${lbUser2}**. This may take a few minutes...`);

    try {
        const [diary1, diary2] = await Promise.all([
            getFullDiary(lbUser1),
            getFullDiary(lbUser2)
        ]);

        if (diary1.length === 0 || diary2.length === 0) {
            return interaction.editReply('One or both users have no movies in their diary.');
        }

        const diary2Slugs = new Map(diary2.map(film => [film.slug, film]));
        const commonFilms = [];
        for (const film1 of diary1) {
            if (diary2Slugs.has(film1.slug)) {
                const film2 = diary2Slugs.get(film1.slug);
                commonFilms.push({ title: film1.title, slug: film1.slug, year: film1.year, rating1: film1.rating, rating2: film2.rating });
                diary2Slugs.delete(film1.slug);
            }
        }

        if (commonFilms.length === 0) {
            return interaction.editReply(`No common movies found between **${lbUser1}** and **${lbUser2}**.`);
        }

        let currentPage = 0;
        const totalPages = Math.ceil(commonFilms.length / ITEMS_PER_PAGE);

        const embed = generateCompareEmbed(currentPage, totalPages, commonFilms, user1, user2);
        const row = new ActionRowBuilder().addComponents(generateButtons(currentPage, totalPages));

        const reply = await interaction.editReply({ content: '', embeds: [embed], components: [row] });

        const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 5 * 60 * 1000
        });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: 'Only the command initiator can navigate through pages.', ephemeral: true });
            }

            if (i.customId === 'prev_page') currentPage--;
            else if (i.customId === 'next_page') currentPage++;

            const newEmbed = generateCompareEmbed(currentPage, totalPages, commonFilms, user1, user2);
            const newRow = new ActionRowBuilder().addComponents(generateButtons(currentPage, totalPages));
            await i.update({ embeds: [newEmbed], components: [newRow] });
        });

        collector.on('end', () => {
            const disabledRow = new ActionRowBuilder().addComponents(generateButtons(currentPage, totalPages, true));
            interaction.editReply({ components: [disabledRow] });
        });

    } catch (error) {
        console.error('Error in /compare command:', error);
        await interaction.editReply({ content: `An error occurred while comparing diaries: ${error.message}` });
    }
}

function generateCompareEmbed(page, totalPages, commonFilms, user1, user2) {
    const startIndex = page * ITEMS_PER_PAGE;
    const pageItems = commonFilms.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    
    const formatRating = (rating) => {
        if (rating === null) return 'N/A';
        const stars = '⭐'.repeat(Math.floor(rating));
        const halfStar = (rating % 1 !== 0) ? '½' : '';
        return `${stars}${halfStar}`;
    };

    const filmListString = pageItems
        .map(film => `• **[${film.title} (${film.year || '????'})](https://letterboxd.com/film/${film.slug}/)**\n  └ ${user1.displayName}: ${formatRating(film.rating1)} | ${user2.displayName}: ${formatRating(film.rating2)}`)
        .join('\n\n');

    const description = `**Mutuals: ${commonFilms.length}**\n\n${filmListString}`;

    return new EmbedBuilder()
        .setColor(0x00E054)
        .setTitle(`Comparing ${user1.displayName} and ${user2.displayName}`)
        .setDescription(description)
        .setFooter({ text: `Page ${page + 1} of ${totalPages}` });
}

function generateButtons(page, totalPages, disabled = false) {
    const prevButton = new ButtonBuilder()
        .setCustomId('prev_page')
        .setLabel('<')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0 || disabled);

    const nextButton = new ButtonBuilder()
        .setCustomId('next_page')
        .setLabel('>')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1 || disabled);

    return [prevButton, nextButton];
}
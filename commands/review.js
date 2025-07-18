import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType, MessageFlags } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import getRecentReviews from '../scraper/getReview.js';
import { searchMovieTMDB } from '../api/tmdb.js';
import { createReviewEmbed } from '../utils/formatEmbed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

export const data = new SlashCommandBuilder()
    .setName('review')
    .setDescription('Shows the latest review or searches for a specific movie review.')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Mention another Discord user to view their review.')
            .setRequired(false))
    .addStringOption(option =>
        option.setName('film')
            .setDescription('Title of the movie to search for a specific review.')
            .setRequired(false));

async function processAndSendReview(interaction, review, letterboxdUsername, isUpdate = false) {
    if (!review || !review.filmTitle || !review.reviewUrl) {
        console.error('Scraping error: The returned review object is invalid.', review);
        const errorMessage = 'Could not extract review details. Page format might have changed.';
        if (isUpdate) {
            return interaction.editReply({ content: errorMessage, embeds: [], components: [] });
        }
        return interaction.editReply({ content: errorMessage });
    }

    let tmdbDetails = null;
    if (review.filmTitle && review.filmYear) {
        try {
            tmdbDetails = await searchMovieTMDB(review.filmTitle, review.filmYear);
        } catch (tmdbError) {
            console.error(`TMDB error for ${review.filmTitle}:`, tmdbError.message);
        }
    }

    const embed = await createReviewEmbed(review, tmdbDetails, letterboxdUsername);
    
    const payload = { embeds: [embed], components: [] };
    if (!isUpdate) {
        payload.content = '';
    }

    await interaction.editReply(payload);
}


export async function execute(interaction) {
    const targetDiscordUser = interaction.options.getUser('user') || interaction.user;
    const filmQuery = interaction.options.getString('film');

    let users = {};
    try {
        const data = await fs.readFile(usersFilePath, 'utf8');
        users = JSON.parse(data);
    } catch (readError) {
        if (readError.code !== 'ENOENT') {
            return interaction.reply({ content: 'Internal error fetching user links.', flags: [MessageFlags.Ephemeral] });
        }
    }
    const letterboxdUsername = users[targetDiscordUser.id]?.letterboxd || users[targetDiscordUser.id];
    if (!letterboxdUsername) {
        const who = targetDiscordUser.id === interaction.user.id ? 'You have not linked your account' : `User ${targetDiscordUser.displayName} has not linked their account`;
        return interaction.reply({ content: `${who} Letterboxd. Use /link.`, flags: [MessageFlags.Ephemeral] });
    }

    await interaction.deferReply();

    try {
        const allUserReviews = await getRecentReviews(letterboxdUsername);

        if (!allUserReviews || allUserReviews.length === 0) {
            return interaction.editReply({ content: `Could not find any reviews for \`${letterboxdUsername}\`.` });
        }

        if (filmQuery) {
            const filteredReviews = allUserReviews.filter(review =>
                review.filmTitle.toLowerCase().includes(filmQuery.toLowerCase())
            );

            if (filteredReviews.length === 0) {
                return interaction.editReply({ content: `Could not find any reviews for "${filmQuery}" in \`${letterboxdUsername}\`'s profile.` });
            } else if (filteredReviews.length === 1) {
                await processAndSendReview(interaction, filteredReviews[0], letterboxdUsername);
            } else {
                const reviewsToChoose = filteredReviews.slice(0, 25);
                const selectOptions = reviewsToChoose.map((review, index) => ({
                    label: `${review.filmTitle} (${review.filmYear || '????'})`,
                    description: `Rating: ${review.rating ? '⭐'.repeat(review.rating) : 'N/A'}`,
                    value: index.toString(),
                }));
                const selectMenu = new StringSelectMenuBuilder().setCustomId('select_review').setPlaceholder('Select the review you want to view...').addOptions(selectOptions);
                const row = new ActionRowBuilder().addComponents(selectMenu);

                const reply = await interaction.editReply({
                    content: `Found ${filteredReviews.length} reviews for "${filmQuery}". Select one:`,
                    components: [row],
                });

                try {
                    const selection = await reply.awaitMessageComponent({
                        filter: i => i.user.id === interaction.user.id && i.customId === 'select_review',
                        componentType: ComponentType.StringSelect,
                        time: 60000,
                    });
                    
                    const selectedIndex = parseInt(selection.values[0]);
                    const targetReview = reviewsToChoose[selectedIndex];
                    await processAndSendReview(selection, targetReview, letterboxdUsername, true);

                } catch (err) {
                    await interaction.editReply({ content: 'You did not select a review in time.', components: [] });
                }
            }
        } else {
            const latestReview = allUserReviews[0];
            await processAndSendReview(interaction, latestReview, letterboxdUsername);
        }
    } catch (error) {
        console.error(`Error in /review for ${targetDiscordUser.tag}:`, error);
        await interaction.editReply({ content: `An error occurred while accessing this user's reviews. Details: ${error.message}` });
    }
}
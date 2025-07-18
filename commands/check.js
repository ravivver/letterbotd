import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType, MessageFlags } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { searchLetterboxd } from '../scraper/searchLetterboxd.js';
import { checkFilmInDiary } from '../scraper/checkFilmInDiary.js';
import getFilmDetailsFromSlug from '../scraper/getFilmDetailsFromSlug.js';
import { searchMovieTMDB, getTmdbPosterUrl } from '../api/tmdb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

export const data = new SlashCommandBuilder()
    .setName('check')
    .setDescription('Checks if a user has watched a specific movie.')
    .addUserOption(option => option.setName('user').setDescription('The user to be checked.').setRequired(true))
    .addStringOption(option => option.setName('film').setDescription('The title of the movie you want to check.').setRequired(true));

export async function execute(interaction) {
    const targetDiscordUser = interaction.options.getUser('user');
    let usersData;
    try {
        usersData = JSON.parse(await fs.readFile(usersFilePath, 'utf8'));
    } catch (error) {
        return interaction.reply({ content: 'Error reading user file.', flags: [MessageFlags.Ephemeral] });
    }
    const userEntry = usersData[targetDiscordUser.id];
    let letterboxdUsername;
    if (typeof userEntry === 'string') letterboxdUsername = userEntry;
    else if (typeof userEntry === 'object' && userEntry !== null) letterboxdUsername = userEntry.letterboxd;

    if (!letterboxdUsername) {
        return interaction.reply({ content: `User ${targetDiscordUser.username} has not linked an account.`, flags: [MessageFlags.Ephemeral] });
    }

    await interaction.deferReply(); 

    const filmQuery = interaction.options.getString('film');
    const searchResults = await searchLetterboxd(filmQuery);
    const filmResults = searchResults.filter(r => r.type === 'film');

    if (filmResults.length === 0) {
        return interaction.editReply({ content: `No movies found for the search "${filmQuery}".` });
    }

    if (filmResults.length > 1) {
        const filmOptions = filmResults.map(film => ({
            label: film.title.substring(0, 100),
            description: film.year ? `Year: ${film.year}` : 'Movie',
            value: film.slug,
        }));
        const selectMenu = new StringSelectMenuBuilder().setCustomId('checkfilm_select').setPlaceholder('Multiple movies found. Select one.').addOptions(filmOptions.slice(0, 25));
        const row = new ActionRowBuilder().addComponents(selectMenu);

        const reply = await interaction.editReply({
            content: `We found multiple movies. Please choose one to check:`,
            components: [row],
            fetchReply: true, 
        });

        try {
            const selection = await reply.awaitMessageComponent({
                filter: i => i.user.id === interaction.user.id,
                componentType: ComponentType.StringSelect,
                time: 60_000,
            });
            const filmSlug = selection.values[0];
            await processFilmCheck(selection, targetDiscordUser, letterboxdUsername, filmSlug);
        } catch (err) {
            await interaction.editReply({ content: 'Selection time has expired.', components: [] });
        }
    } else {
        const filmSlug = filmResults[0].slug;
        await processFilmCheck(interaction, targetDiscordUser, letterboxdUsername, filmSlug);
    }
}

async function processFilmCheck(interaction, discordUser, letterboxdUsername, filmSlug) {
    if (interaction.isMessageComponent()) {
        await interaction.update({ content: 'Checking diary...', components: [] });
    }

    try {
        const filmDetails = await getFilmDetailsFromSlug(filmSlug);
        if (!filmDetails) throw new Error('Could not retrieve movie details from Letterboxd.');
        
        const [diaryStatus, movieDataTMDB] = await Promise.all([
            checkFilmInDiary(letterboxdUsername, filmSlug),
            searchMovieTMDB(filmDetails.title, filmDetails.year)
        ]);

        const embed = new EmbedBuilder()
            .setAuthor({ name: `Checking for: ${letterboxdUsername}`, iconURL: discordUser.displayAvatarURL() })
            .setTitle(`${filmDetails.title} (${filmDetails.year})`)
            .setURL(`https://letterboxd.com/film/${filmSlug}/`)
            .setThumbnail(movieDataTMDB ? getTmdbPosterUrl(movieDataTMDB.poster_path) : null);

        if (diaryStatus.watched) {
            embed.setColor(0x23A55A);
            let description = `🟢 ** Yes, ${discordUser.displayName} has watched it!**`;
            let detailsLine = '';

            if (diaryStatus.rating) {
                const stars = '⭐'.repeat(Math.floor(diaryStatus.rating));
                const halfStar = (diaryStatus.rating % 1 !== 0) ? '½' : '';
                detailsLine += `**Rating:** ${stars}${halfStar}`;
            }

            if (diaryStatus.date) {
                const formattedDate = diaryStatus.date.split('-').reverse().join('/');
                if (detailsLine.length > 0) {
                    detailsLine += '   '; 
                }
                detailsLine += `** Date:** ${formattedDate}`;
            }
            
            if(detailsLine.length > 0) {
                description += `\n\n${detailsLine}`;
            }
            
            embed.setDescription(description);

        } else {
            embed.setColor(0xED4245);
            embed.setDescription(`🔴 ** No, ${discordUser.displayName} has not watched it.**`);
        }
        
        await interaction.editReply({ content: '', embeds: [embed], components: [] });

    } catch (error) {
        console.error('Error processing film check:', error);
        await interaction.editReply({ content: `An error occurred while checking the movie: ${error.message}`, embeds: [], components: [] });
    }
}